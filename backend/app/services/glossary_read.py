"""Glossary list/read helpers."""

from __future__ import annotations

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.glossary import Glossary
from app.models.glossary_term import GlossaryTerm
from app.schemas.glossary import GlossaryListResponse, GlossaryResponse
from app.services.resource_acl_constants import RT_GLOSSARY
from app.services.resource_list_acl import readable_id_filter


def glossary_to_response(glossary: Glossary, term_count: int) -> GlossaryResponse:
    return GlossaryResponse(
        id=glossary.id,
        name=glossary.name,
        description=glossary.description,
        term_count=term_count,
        created_at=glossary.created_at,
        updated_at=glossary.updated_at,
    )


async def glossary_term_counts_batch(db: AsyncSession, glossary_ids: list[str]) -> dict[str, int]:
    if not glossary_ids:
        return {}
    rows = await db.execute(
        select(GlossaryTerm.glossary_id, func.count())
        .where(GlossaryTerm.glossary_id.in_(glossary_ids))
        .group_by(GlossaryTerm.glossary_id)
    )
    return {str(gid): int(count) for gid, count in rows.all()}


async def glossary_term_count(db: AsyncSession, glossary_id: str) -> int:
    counts = await glossary_term_counts_batch(db, [glossary_id])
    return counts.get(glossary_id, 0)


async def list_glossaries_page(
    db: AsyncSession,
    request: Request,
    *,
    limit: int,
    offset: int,
) -> GlossaryListResponse:
    payload = request.state.openkms_jwt_payload
    sub = payload.get("sub")
    acl_filters, empty = await readable_id_filter(
        db, payload, sub if isinstance(sub, str) else None, RT_GLOSSARY, Glossary.id
    )
    if empty:
        return GlossaryListResponse(items=[], total=0, limit=limit, offset=offset)

    count_q = select(func.count()).select_from(Glossary)
    if acl_filters:
        count_q = count_q.where(*acl_filters)
    total = int((await db.execute(count_q)).scalar_one())

    q = select(Glossary).order_by(Glossary.created_at.desc())
    if acl_filters:
        q = q.where(*acl_filters)
    q = q.offset(offset).limit(limit)
    glossaries = list((await db.execute(q)).scalars().all())

    term_counts = await glossary_term_counts_batch(db, [g.id for g in glossaries])
    items = [glossary_to_response(g, term_counts.get(g.id, 0)) for g in glossaries]
    return GlossaryListResponse(items=items, total=total, limit=limit, offset=offset)
