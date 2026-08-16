"""Apply Function edit batches to object instances (Action execute path).

v1: only ``modify`` ops on resolvable ``ObjectInstance`` rows (instance id as primary_key).
``create`` / ``delete`` and dataset / Neo4j synthetic ids are not applied.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.object_instance import ObjectInstance
from app.models.object_type import ObjectType


@dataclass
class EditApplyResult:
    modified_ids: list[str] = field(default_factory=list)
    skipped: list[dict] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "modified_ids": list(self.modified_ids),
            "skipped": list(self.skipped),
            "errors": list(self.errors),
        }


def extract_edits(output: dict | None) -> list[dict]:
    if not output:
        return []
    edits = output.get("edits")
    if isinstance(edits, list):
        return [e for e in edits if isinstance(e, dict)]
    return []


async def _resolve_object_type_id(db: AsyncSession, object_type: str) -> ObjectType | None:
    ot = (
        await db.execute(select(ObjectType).where(ObjectType.name == object_type))
    ).scalar_one_or_none()
    if ot:
        return ot
    return await db.get(ObjectType, object_type)


async def apply_edit_batch_to_objects(
    db: AsyncSession,
    edits: list[dict],
    *,
    allowed_object_type_id: str | None = None,
) -> EditApplyResult:
    """Merge ``modify`` properties into object instance ``data``.

    Unknown ids / type mismatches are recorded in ``errors`` / ``skipped`` and do not
    raise — callers may still audit the Action as ok with partial apply, or treat
    errors as Action failure. This helper raises nothing for skip cases.
    """
    result = EditApplyResult()
    for edit in edits:
        op = edit.get("op")
        if op != "modify":
            result.skipped.append({"op": op, "reason": "only_modify_supported"})
            continue
        object_type = edit.get("object_type")
        primary_key = edit.get("primary_key")
        properties = edit.get("properties")
        if not object_type or not primary_key:
            result.errors.append("modify edit missing object_type or primary_key")
            continue
        if not isinstance(properties, dict) or not properties:
            result.skipped.append({"op": "modify", "primary_key": primary_key, "reason": "empty_properties"})
            continue

        ot = await _resolve_object_type_id(db, str(object_type))
        if not ot:
            result.errors.append(f"object type not found: {object_type}")
            continue
        if allowed_object_type_id and ot.id != allowed_object_type_id:
            result.errors.append(
                f"edit object type {object_type} does not match action object type"
            )
            continue

        instance = await db.get(ObjectInstance, str(primary_key))
        if not instance:
            result.errors.append(f"object instance not found: {primary_key}")
            continue
        if instance.object_type_id != ot.id:
            result.errors.append(
                f"instance {primary_key} is not of type {object_type}"
            )
            continue

        merged = dict(instance.data or {})
        merged.update(properties)
        instance.data = merged
        result.modified_ids.append(instance.id)

    return result
