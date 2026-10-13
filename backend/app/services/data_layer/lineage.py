"""Read-time lineage for a dataset (no persisted lineage table).

Upstream: the backing data source. Downstream: ontology object/link types that
reference the dataset. Lateral: other datasets connected by registered joins.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.models.dataset_join import DatasetJoin
from app.models.link_type import LinkType
from app.models.object_type import ObjectType


def _label(d: Dataset) -> str:
    return d.display_name or f"{d.schema_name}.{d.table_name}"


async def build_lineage(db: AsyncSession, dataset_id: str) -> dict[str, Any] | None:
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        return None
    ds = await db.get(DataSource, dataset.data_source_id)

    upstream: list[dict[str, Any]] = []
    if ds is not None:
        upstream.append({"type": "data_source", "id": ds.id, "label": ds.name})

    ots = (
        await db.execute(select(ObjectType).where(ObjectType.dataset_id == dataset_id))
    ).scalars().all()
    lts = (
        await db.execute(select(LinkType).where(LinkType.dataset_id == dataset_id))
    ).scalars().all()
    joins = (
        await db.execute(
            select(DatasetJoin).where(
                or_(
                    DatasetJoin.from_dataset_id == dataset_id,
                    DatasetJoin.to_dataset_id == dataset_id,
                )
            )
        )
    ).scalars().all()

    downstream: list[dict[str, Any]] = []
    downstream.extend({"type": "object_type", "id": ot.id, "label": ot.name} for ot in ots)
    downstream.extend({"type": "link_type", "id": lt.id, "label": lt.name} for lt in lts)

    join_ids: set[str] = set()
    joined: list[dict[str, Any]] = []
    for j in joins:
        other_id = j.to_dataset_id if j.from_dataset_id == dataset_id else j.from_dataset_id
        join_ids.add(other_id)
        joined.append(
            {"join_id": j.id, "dataset_id": other_id, "required": j.required}
        )
    names: dict[str, str] = {}
    if join_ids:
        rows = (
            await db.execute(select(Dataset).where(Dataset.id.in_(join_ids)))
        ).scalars().all()
        names = {d.id: _label(d) for d in rows}
    for j in joined:
        j["dataset_name"] = names.get(j["dataset_id"])

    return {
        "dataset": {"type": "dataset", "id": dataset.id, "label": _label(dataset)},
        "upstream": upstream,
        "downstream": downstream,
        "joined_datasets": joined,
    }
