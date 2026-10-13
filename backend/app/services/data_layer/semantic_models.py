"""Semantic models — a named scope over the shared data layer.

Datasets, their fields, and relationships are shared (Catalog-owned). A semantic
model references a subset of datasets and owns its metrics and queries.
"""
from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dataset import Dataset
from app.models.semantic_model import SemanticModel
from app.models.semantic_model_dataset import SemanticModelDataset


class SemanticModelError(ValueError):
    """Raised for invalid semantic models; surfaced as HTTP 400."""


async def dataset_refs(db: AsyncSession, ids: list[str]) -> dict[str, str]:
    """id → display name for the given datasets (existing ones only)."""
    if not ids:
        return {}
    rows = (await db.execute(select(Dataset).where(Dataset.id.in_(ids)))).scalars().all()
    return {d.id: (d.display_name or f"{d.schema_name}.{d.table_name}") for d in rows}


async def member_ids(db: AsyncSession, model_id: str) -> list[str]:
    rows = (
        await db.execute(
            select(SemanticModelDataset.dataset_id).where(
                SemanticModelDataset.semantic_model_id == model_id
            )
        )
    ).scalars().all()
    return list(rows)


async def members_map(db: AsyncSession, model_ids: list[str]) -> dict[str, list[str]]:
    if not model_ids:
        return {}
    rows = (
        await db.execute(
            select(SemanticModelDataset).where(
                SemanticModelDataset.semantic_model_id.in_(model_ids)
            )
        )
    ).scalars().all()
    out: dict[str, list[str]] = {mid: [] for mid in model_ids}
    for row in rows:
        out.setdefault(row.semantic_model_id, []).append(row.dataset_id)
    return out


async def set_members(db: AsyncSession, model_id: str, dataset_ids: list[str]) -> None:
    ids = list(dict.fromkeys(dataset_ids))
    if ids:
        found = set(
            (await db.execute(select(Dataset.id).where(Dataset.id.in_(ids)))).scalars().all()
        )
        missing = [i for i in ids if i not in found]
        if missing:
            raise SemanticModelError(f"Unknown dataset(s): {', '.join(missing)}")
    await db.execute(
        delete(SemanticModelDataset).where(SemanticModelDataset.semantic_model_id == model_id)
    )
    for dataset_id in ids:
        db.add(SemanticModelDataset(semantic_model_id=model_id, dataset_id=dataset_id))


async def create_semantic_model(
    db: AsyncSession,
    *,
    name: str,
    description: str | None,
    dataset_ids: list[str],
    ai_context: dict | None,
    sub: str | None,
    uname: str | None,
) -> SemanticModel:
    if not (name or "").strip():
        raise SemanticModelError("A semantic model needs a name.")
    model = SemanticModel(
        id=str(uuid.uuid4()),
        name=name.strip(),
        description=description,
        ai_context=ai_context,
        created_by=sub,
        created_by_name=uname,
    )
    db.add(model)
    await db.flush()
    await set_members(db, model.id, dataset_ids)
    await db.commit()
    await db.refresh(model)
    return model


async def apply_update(db: AsyncSession, model: SemanticModel, data: dict) -> None:
    if "name" in data:
        if not (data["name"] or "").strip():
            raise SemanticModelError("A semantic model needs a name.")
        model.name = data["name"].strip()
    if "description" in data:
        model.description = data["description"]
    if "ai_context" in data:
        model.ai_context = data["ai_context"]
    if "dataset_ids" in data:
        await set_members(db, model.id, data["dataset_ids"] or [])
    await db.commit()
    await db.refresh(model)
