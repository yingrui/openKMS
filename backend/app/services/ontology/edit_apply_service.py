"""Apply Function edit batches to the object_instances apply queue.

Applies ``create`` / ``modify`` / ``delete`` on resolvable queue rows (instance id as
``primary_key``). Dataset-backed object types are rejected. Callers sync the queue
into Neo4j in the same request when a Neo4j data source exists.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.object_instance import ObjectInstance
from app.models.object_type import ObjectType
from app.services.ontology.object_neo4j_store import fetch_object_from_neo4j


@dataclass
class EditApplyResult:
    created_ids: list[str] = field(default_factory=list)
    modified_ids: list[str] = field(default_factory=list)
    deleted_ids: list[str] = field(default_factory=list)
    skipped: list[dict] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "created_ids": list(self.created_ids),
            "modified_ids": list(self.modified_ids),
            "deleted_ids": list(self.deleted_ids),
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


async def _resolve_ot_for_edit(
    db: AsyncSession,
    result: EditApplyResult,
    object_type: object,
    *,
    allowed_object_type_id: str | None,
    op: str,
) -> ObjectType | None:
    if not object_type:
        result.errors.append(f"{op} edit missing object_type")
        return None
    ot = await _resolve_object_type_id(db, str(object_type))
    if not ot:
        result.errors.append(f"object type not found: {object_type}")
        return None
    if allowed_object_type_id and ot.id != allowed_object_type_id:
        result.errors.append(
            f"edit object type {object_type} does not match action object type"
        )
        return None
    if getattr(ot, "dataset_id", None):
        result.errors.append(
            f"cannot apply {op} to dataset-backed object type {object_type}"
        )
        return None
    return ot


async def apply_edit_batch_to_objects(
    db: AsyncSession,
    edits: list[dict],
    *,
    allowed_object_type_id: str | None = None,
) -> EditApplyResult:
    """Apply create / modify / delete edits onto the object_instances queue.

    Unknown ids / type mismatches are recorded in ``errors`` / ``skipped`` and do not
    raise — callers may still audit the Action as ok with partial apply, or treat
    errors as Action failure.
    """
    result = EditApplyResult()
    for edit in edits:
        op = edit.get("op")
        if op == "create":
            await _apply_create(db, result, edit, allowed_object_type_id=allowed_object_type_id)
        elif op == "modify":
            await _apply_modify(db, result, edit, allowed_object_type_id=allowed_object_type_id)
        elif op == "delete":
            await _apply_delete(db, result, edit, allowed_object_type_id=allowed_object_type_id)
        else:
            result.skipped.append({"op": op, "reason": "unsupported_op"})
    return result


async def _apply_create(
    db: AsyncSession,
    result: EditApplyResult,
    edit: dict,
    *,
    allowed_object_type_id: str | None,
) -> None:
    ot = await _resolve_ot_for_edit(
        db, result, edit.get("object_type"), allowed_object_type_id=allowed_object_type_id, op="create"
    )
    if not ot:
        return
    properties = edit.get("properties")
    if properties is None:
        properties = {}
    if not isinstance(properties, dict):
        result.errors.append("create edit properties must be an object")
        return

    primary_key = edit.get("primary_key")
    pk = str(primary_key).strip() if primary_key else ""
    if not pk:
        pk = str(uuid.uuid4())

    existing = await db.get(ObjectInstance, pk)
    if existing:
        result.errors.append(f"object instance already exists: {pk}")
        return

    instance = ObjectInstance(id=pk, object_type_id=ot.id, data=dict(properties))
    db.add(instance)
    result.created_ids.append(pk)


async def _ensure_queue_row(
    db: AsyncSession,
    ot: ObjectType,
    primary_key: str,
) -> ObjectInstance | None:
    """Return queue row; if missing, seed from Neo4j node props when present."""
    instance = await db.get(ObjectInstance, primary_key)
    if instance:
        return instance
    props = await fetch_object_from_neo4j(db, ot, primary_key)
    if not props:
        return None
    data = {k: v for k, v in props.items() if k != "id"}
    instance = ObjectInstance(id=primary_key, object_type_id=ot.id, data=data)
    db.add(instance)
    await db.flush()
    return instance


async def _apply_modify(
    db: AsyncSession,
    result: EditApplyResult,
    edit: dict,
    *,
    allowed_object_type_id: str | None,
) -> None:
    primary_key = edit.get("primary_key")
    properties = edit.get("properties")
    if not primary_key:
        result.errors.append("modify edit missing primary_key")
        return
    if not isinstance(properties, dict) or not properties:
        result.skipped.append({"op": "modify", "primary_key": primary_key, "reason": "empty_properties"})
        return

    ot = await _resolve_ot_for_edit(
        db, result, edit.get("object_type"), allowed_object_type_id=allowed_object_type_id, op="modify"
    )
    if not ot:
        return

    instance = await _ensure_queue_row(db, ot, str(primary_key))
    if not instance:
        result.errors.append(f"object instance not found: {primary_key}")
        return
    if instance.object_type_id != ot.id:
        result.errors.append(f"instance {primary_key} is not of type {edit.get('object_type')}")
        return

    merged = dict(instance.data or {})
    merged.update(properties)
    instance.data = merged
    result.modified_ids.append(instance.id)


async def _apply_delete(
    db: AsyncSession,
    result: EditApplyResult,
    edit: dict,
    *,
    allowed_object_type_id: str | None,
) -> None:
    primary_key = edit.get("primary_key")
    if not primary_key:
        result.errors.append("delete edit missing primary_key")
        return

    ot = await _resolve_ot_for_edit(
        db, result, edit.get("object_type"), allowed_object_type_id=allowed_object_type_id, op="delete"
    )
    if not ot:
        return

    instance = await db.get(ObjectInstance, str(primary_key))
    if instance:
        if instance.object_type_id != ot.id:
            result.errors.append(f"instance {primary_key} is not of type {edit.get('object_type')}")
            return
        await db.delete(instance)
        result.deleted_ids.append(str(primary_key))
        return

    # Queue miss: still record delete so same-request Neo4j sync can remove the node.
    props = await fetch_object_from_neo4j(db, ot, str(primary_key))
    if not props:
        result.errors.append(f"object instance not found: {primary_key}")
        return
    result.deleted_ids.append(str(primary_key))
