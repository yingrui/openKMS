"""Generate openkms_ontology_sdk from database metadata (publish hook / CLI)."""

from __future__ import annotations

import logging
import re
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.object_type import ObjectType
from app.models.ontology_function import OntologyFunction

logger = logging.getLogger(__name__)


def _pascal(name: str) -> str:
    cls = re.sub(r"[^a-zA-Z0-9_]", "", str(name))
    if not cls:
        return "ObjectType"
    if cls[0].isdigit():
        cls = f"O_{cls}"
    return cls


def _snake(name: str) -> str:
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name)
    return s.replace("-", "_").lower()


def sdk_output_dir() -> Path:
    configured = (settings.ontology_sdk_output_dir or "").strip()
    if configured:
        return Path(configured)
    # Default: repo ontology-function-service/openkms_ontology_sdk
    return Path(__file__).resolve().parents[4] / "ontology-function-service" / "openkms_ontology_sdk"


def render_sdk_source(*, object_types: list[tuple[str, str]], queries: list[tuple[str, str]]) -> str:
    lines = [
        '"""Generated ontology SDK — do not edit by hand.',
        "",
        "Regenerate via Manager publish or:",
        "  python scripts/generate_ontology_sdk.py",
        '"""',
        "from __future__ import annotations",
        "",
        "from dataclasses import dataclass",
        "",
        "__all__ = [",
    ]
    export_names: list[str] = []
    body: list[str] = []

    for api_name, display in object_types:
        cls = _pascal(api_name)
        export_names.append(cls)
        body.extend(
            [
                "",
                "@dataclass(frozen=True)",
                f"class {cls}:",
                f'    """Object type: {display or api_name}"""',
                f'    api_name: str = "{api_name}"',
            ]
        )

    for api_name, display in queries:
        cls = _snake(api_name)
        # Prefer unique class names; avoid colliding with builtins
        if cls in export_names or not cls:
            cls = f"query_{cls}" if cls else f"query_{_pascal(api_name)}"
        export_names.append(cls)
        body.extend(
            [
                "",
                "@dataclass(frozen=True)",
                f"class {cls}:",
                f'    """Published function query: {display or api_name}"""',
                f'    api_name: str = "{api_name}"',
            ]
        )

    for name in export_names:
        lines.append(f'    "{name}",')
    lines.append("]")
    lines.extend(body)
    lines.append("")
    return "\n".join(lines)


async def generate_ontology_sdk(db: AsyncSession) -> Path:
    """Write openkms_ontology_sdk/__init__.py from current ontology metadata."""
    ot_rows = (await db.execute(select(ObjectType).order_by(ObjectType.name))).scalars().all()
    object_types = [(ot.name, ot.description or ot.name) for ot in ot_rows if ot.name]

    fn_rows = (
        await db.execute(
            select(OntologyFunction)
            .where(OntologyFunction.published_version_id.is_not(None))
            .order_by(OntologyFunction.api_name)
        )
    ).scalars().all()
    queries = [(fn.api_name, fn.display_name) for fn in fn_rows if fn.api_name]

    out_dir = sdk_output_dir()
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / "__init__.py"
    target.write_text(render_sdk_source(object_types=object_types, queries=queries), encoding="utf-8")
    logger.info("Wrote ontology SDK to %s (%s object types, %s queries)", target, len(object_types), len(queries))
    return target
