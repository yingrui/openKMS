"""Export / import the openKMS semantic model as an Ossie document.

A semantic model is: **datasets** (source + keys + fields + `ai_context`) +
**relationships** (FKs) + **metrics** (SQL expressions) + **queries**. Export is a
pure read (a governance artifact / interoperability); import upserts the semantic
layer over datasets that are already registered.

References use openKMS stable **ids** (`from`/`to`/`base_dataset`/`metric`), with a
human `name` alongside. Import also accepts Ossie-style **names** (matching by
dataset source or name), so an external document can be imported.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.models.dataset_field import DatasetField
from app.models.dataset_join import DatasetJoin
from app.models.metric_definition import MetricDefinition
from app.models.saved_query import SavedQuery

OSSIE_VERSION = "openkms-1"


def _dataset_name(d: Dataset) -> str:
    return d.display_name or f"{d.schema_name}.{d.table_name}"


async def export_semantic_model(db: AsyncSession) -> dict[str, Any]:
    """Build the Ossie document for the whole data layer."""
    datasets = (await db.execute(select(Dataset).order_by(Dataset.created_at))).scalars().all()
    fields = (await db.execute(select(DatasetField))).scalars().all()
    relationships = (await db.execute(select(DatasetJoin))).scalars().all()
    metrics = (await db.execute(select(MetricDefinition))).scalars().all()
    queries = (await db.execute(select(SavedQuery))).scalars().all()
    ds_names = {
        ds.id: ds.name
        for ds in (await db.execute(select(DataSource))).scalars().all()
    }

    fields_by_dataset: dict[str, list[DatasetField]] = {}
    for f in fields:
        fields_by_dataset.setdefault(f.dataset_id, []).append(f)

    return {
        "ossie_version": OSSIE_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "semantic_model": {
            "datasets": [
                {
                    "id": d.id,
                    "name": _dataset_name(d),
                    "source": {
                        "data_source": ds_names.get(d.data_source_id),
                        "schema": d.schema_name,
                        "table": d.table_name,
                    },
                    "primary_key": d.primary_key_columns or [],
                    "unique_keys": d.unique_keys or [],
                    "ai_context": d.ai_context,
                    "fields": [
                        {
                            "name": f.name,
                            "column": f.column_name,
                            "expression": f.expression,
                            "datatype": f.datatype,
                            "dimension": f.dimension,
                            "ai_context": f.ai_context,
                        }
                        for f in fields_by_dataset.get(d.id, [])
                    ],
                }
                for d in datasets
            ],
            "relationships": [
                {
                    "id": r.id,
                    "name": r.name,
                    "from": r.from_dataset_id,
                    "to": r.to_dataset_id,
                    "from_columns": r.from_columns or [],
                    "to_columns": r.to_columns or [],
                    "join_type": r.join_type,
                    "ai_context": r.ai_context,
                }
                for r in relationships
            ],
            "metrics": [
                {
                    "id": m.id,
                    "name": m.name,
                    "type": m.type,
                    "base_dataset": m.base_dataset_id,
                    "expression": m.expression,
                    "datatype": m.datatype,
                    "business_definition": m.business_definition,
                    "filters": m.filters,
                    "joins": m.joins or [],
                    "ai_context": m.ai_context,
                }
                for m in metrics
            ],
            "queries": [
                {
                    "id": q.id,
                    "name": q.name,
                    "base_dataset": q.base_dataset_id,
                    "metrics": q.metrics or [],
                    "group_by": q.group_by or [],
                    "joins": q.joins or [],
                    "filters": q.filters,
                    "exports": q.exports or [],
                    "ai_context": q.ai_context,
                }
                for q in queries
            ],
        },
    }


async def _dataset_index(db: AsyncSession) -> tuple[dict[str, str], dict[str, str], dict[str, str]]:
    """Return (by_id, by_source, by_name) → dataset id."""
    datasets = (await db.execute(select(Dataset))).scalars().all()
    ds_names = {
        ds.id: ds.name for ds in (await db.execute(select(DataSource))).scalars().all()
    }
    by_id: dict[str, str] = {}
    by_source: dict[str, str] = {}
    by_name: dict[str, str] = {}
    for d in datasets:
        by_id[d.id] = d.id
        by_source[f"{ds_names.get(d.data_source_id)}.{d.schema_name}.{d.table_name}"] = d.id
        by_name.setdefault(_dataset_name(d), d.id)
    return by_id, by_source, by_name


def _resolve_dataset(ref: Any, by_id: dict[str, str], by_source: dict[str, str], by_name: dict[str, str]) -> str | None:
    if not isinstance(ref, str):
        return None
    return by_id.get(ref) or by_source.get(ref) or by_name.get(ref)


async def import_semantic_model(db: AsyncSession, doc: dict[str, Any]) -> dict[str, Any]:
    """Upsert relationships / metrics / queries from an Ossie document.

    Datasets must already exist (matched by id, source, or name); they are not
    created. Returns a summary of what was written.
    """
    model = doc.get("semantic_model") if isinstance(doc.get("semantic_model"), dict) else doc
    by_id, by_source, by_name = await _dataset_index(db)
    warnings: list[str] = []

    rel_count = 0
    for rel in model.get("relationships", []) or []:
        from_id = _resolve_dataset(rel.get("from"), by_id, by_source, by_name)
        to_id = _resolve_dataset(rel.get("to"), by_id, by_source, by_name)
        if not from_id or not to_id:
            warnings.append(f"relationship '{rel.get('name')}': unresolved dataset")
            continue
        rel_id = rel.get("id") if isinstance(rel.get("id"), str) else str(uuid.uuid4())
        row = await db.get(DatasetJoin, rel_id)
        if not row:
            row = DatasetJoin(id=rel_id)
            db.add(row)
        row.name = rel.get("name")
        row.from_dataset_id = from_id
        row.to_dataset_id = to_id
        row.from_columns = rel.get("from_columns") or []
        row.to_columns = rel.get("to_columns") or []
        row.join_type = rel.get("join_type") or "left"
        row.ai_context = rel.get("ai_context")
        rel_count += 1

    metric_count = 0
    for m in model.get("metrics", []) or []:
        base_id = _resolve_dataset(m.get("base_dataset"), by_id, by_source, by_name)
        if not base_id:
            warnings.append(f"metric '{m.get('name')}': unresolved base dataset")
            continue
        metric_id = m.get("id") if isinstance(m.get("id"), str) else str(uuid.uuid4())
        row = await db.get(MetricDefinition, metric_id)
        if not row:
            row = MetricDefinition(id=metric_id)
            db.add(row)
        row.base_dataset_id = base_id
        row.name = m.get("name") or "metric"
        row.type = m.get("type") or "simple"
        row.business_definition = m.get("business_definition")
        row.expression = m.get("expression")
        row.datatype = m.get("datatype")
        row.filters = m.get("filters")
        row.joins = m.get("joins") or []
        row.ai_context = m.get("ai_context")
        metric_count += 1

    query_count = 0
    for q in model.get("queries", []) or []:
        base_id = _resolve_dataset(q.get("base_dataset"), by_id, by_source, by_name)
        if not base_id:
            warnings.append(f"query '{q.get('name')}': unresolved base dataset")
            continue
        query_id = q.get("id") if isinstance(q.get("id"), str) else str(uuid.uuid4())
        row = await db.get(SavedQuery, query_id)
        if not row:
            row = SavedQuery(id=query_id)
            db.add(row)
        row.base_dataset_id = base_id
        row.name = q.get("name") or "query"
        row.metrics = q.get("metrics") or []
        row.group_by = q.get("group_by") or []
        row.joins = q.get("joins") or []
        row.filters = q.get("filters")
        row.exports = q.get("exports") or []
        row.ai_context = q.get("ai_context")
        query_count += 1

    await db.commit()
    return {
        "relationships": rel_count,
        "metrics": metric_count,
        "queries": query_count,
        "warnings": warnings,
    }
