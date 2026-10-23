"""Which external services a Function's source calls.

The destination of a Function-rule Action lives in the Function, not in an Action field — so an
Action page that only says "no webhook" is telling the truth and hiding the answer. Scanning the
source (published version and newest version) puts the real target back on the page.

The scan is textual on purpose: `external("turtle")` is what the author wrote, and a Function can
build a name at runtime only by defeating the allowlist anyway.
"""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.external_service import ExternalService
from app.models.ontology_function import OntologyFunction, OntologyFunctionVersion

EXTERNAL_CALLS_RE = re.compile(r"external\(\s*['\"]([A-Za-z][A-Za-z0-9_]*)['\"]")


def external_service_names(*sources: str) -> list[str]:
    """Service api_names referenced by these source strings, sorted and de-duplicated."""
    names: set[str] = set()
    for source in sources:
        if source:
            names.update(EXTERNAL_CALLS_RE.findall(source))
    return sorted(names)


async def function_sources(db: AsyncSession, function: OntologyFunction) -> list[str]:
    """The published version's source and the newest version's, newest last."""
    version_ids: list[str] = []
    if function.published_version_id:
        version_ids.append(function.published_version_id)
    latest = (
        await db.execute(
            select(OntologyFunctionVersion.id)
            .where(OntologyFunctionVersion.function_id == function.id)
            .order_by(OntologyFunctionVersion.version.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if latest and latest not in version_ids:
        version_ids.append(latest)
    sources: list[str] = []
    for version_id in version_ids:
        version = await db.get(OntologyFunctionVersion, version_id)
        if version and version.source_code:
            sources.append(version.source_code)
    return sources


async def function_external_services(db: AsyncSession, function_id: str) -> list[str]:
    function = await db.get(OntologyFunction, function_id)
    if not function:
        return []
    return external_service_names(*await function_sources(db, function))


async def function_external_service_status(
    db: AsyncSession, function_id: str
) -> list[tuple[str, bool]]:
    """(api_name, is_registered) for each service the Function's source calls.

    A name that is not in the registry is a Function that will fail on that line — worth showing
    rather than hiding behind a successful scan.
    """
    function = await db.get(OntologyFunction, function_id)
    if not function:
        return []
    names = external_service_names(*await function_sources(db, function))
    if not names:
        return []
    registered = set(
        (await db.execute(select(ExternalService.api_name))).scalars().all()
    )
    return [(name, name in registered) for name in names]
