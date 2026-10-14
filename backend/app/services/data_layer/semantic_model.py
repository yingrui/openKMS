"""Export / import a **semantic model** as an Ossie document.

A semantic model is a named scope over the shared data layer: `datasets` (physical
sources + their column descriptions), `relationships` (foreign keys), `fields`
(model-scoped semantic attributes) and `metrics`. Datasets/columns/relationships are
shared; the model owns its fields and metrics.

The document follows the Ossie shape (`semantic_model: [ … ]`, `source` as a dotted
string, `expression.dialects` as a list). openKMS adds a few extensions (documented in
`docs/features/data-layer-semantic-model.md`): a stable `id` on every entity (so a
round-trip is exact) and `base_dataset` on a metric (the engine's `FROM` anchor).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.models.dataset_column import DatasetColumn
from app.models.dataset_join import DatasetJoin
from app.models.metric_definition import MetricDefinition
from app.models.semantic_model import SemanticModel
from app.models.semantic_model_field import SemanticModelField
from app.services.data_layer.semantic_models import member_ids, set_members

OSSIE_VERSION = "openkms-1"


def _dataset_name(d: Dataset) -> str:
    return d.display_name or f"{d.schema_name}.{d.table_name}"


def _dataset_source(d: Dataset, ds_names: dict[str, str]) -> str:
    return f"{ds_names.get(d.data_source_id)}.{d.schema_name}.{d.table_name}"


async def export_semantic_model(db: AsyncSession, model: SemanticModel) -> dict[str, Any]:
    """Build the Ossie document for one semantic model."""
    members = await member_ids(db, model.id)
    member_set = set(members)

    datasets = (
        (await db.execute(select(Dataset).where(Dataset.id.in_(member_set)))).scalars().all()
        if member_set
        else []
    )
    fields = (
        (await db.execute(
            select(SemanticModelField).where(SemanticModelField.semantic_model_id == model.id)
        )).scalars().all()
    )
    columns = (
        (await db.execute(
            select(DatasetColumn).where(DatasetColumn.dataset_id.in_(member_set))
        )).scalars().all()
        if member_set
        else []
    )
    relationships = [
        r
        for r in (await db.execute(select(DatasetJoin))).scalars().all()
        if r.from_dataset_id in member_set and r.to_dataset_id in member_set
    ]
    metrics = (
        await db.execute(
            select(MetricDefinition).where(MetricDefinition.semantic_model_id == model.id)
        )
    ).scalars().all()
    ds_names = {ds.id: ds.name for ds in (await db.execute(select(DataSource))).scalars().all()}

    fields_by_dataset: dict[str, list[SemanticModelField]] = {}
    for f in fields:
        fields_by_dataset.setdefault(f.dataset_id, []).append(f)
    columns_by_dataset: dict[str, list[DatasetColumn]] = {}
    for c in columns:
        columns_by_dataset.setdefault(c.dataset_id, []).append(c)

    model_doc: dict[str, Any] = {
        "id": model.id,
        "name": model.name,
        "description": model.description,
        "ai_context": model.ai_context,
        "datasets": [
            {
                "id": d.id,
                "name": _dataset_name(d),
                "source": _dataset_source(d, ds_names),
                "primary_key": d.primary_key_columns or [],
                "unique_keys": d.unique_keys or [],
                "ai_context": d.ai_context,
                "columns": [
                    {"name": c.column_name, "description": c.description}
                    for c in columns_by_dataset.get(d.id, [])
                    if c.description
                ],
                "fields": [
                    {
                        "name": f.name,
                        "column": f.column_name,
                        "expression": f.expression,
                        "datatype": f.datatype,
                        "description": f.description,
                        "dimension": f.dimension,
                        "entity": f.entity,
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
                "required": r.required,
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
    }

    return {
        "ossie_version": OSSIE_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "semantic_model": [model_doc],
    }


async def _dataset_index(
    db: AsyncSession,
) -> tuple[dict[str, str], dict[str, str], dict[str, str]]:
    """Return (by_id, by_source, by_name) → dataset id."""
    datasets = (await db.execute(select(Dataset))).scalars().all()
    ds_names = {ds.id: ds.name for ds in (await db.execute(select(DataSource))).scalars().all()}
    by_id: dict[str, str] = {}
    by_source: dict[str, str] = {}
    by_name: dict[str, str] = {}
    for d in datasets:
        by_id[d.id] = d.id
        by_source[_dataset_source(d, ds_names)] = d.id
        by_name.setdefault(_dataset_name(d), d.id)
    return by_id, by_source, by_name


def _resolve_dataset(
    ref: Any, by_id: dict[str, str], by_source: dict[str, str], by_name: dict[str, str]
) -> str | None:
    if not isinstance(ref, str):
        return None
    return by_id.get(ref) or by_source.get(ref) or by_name.get(ref)


async def _import_one_model(
    db: AsyncSession,
    model_doc: dict[str, Any],
    by_id: dict[str, str],
    by_source: dict[str, str],
    by_name: dict[str, str],
) -> dict[str, Any]:
    warnings: list[str] = []

    ref_id = model_doc.get("id")
    model = await db.get(SemanticModel, ref_id) if isinstance(ref_id, str) else None
    if model is None:
        name = model_doc.get("name")
        if isinstance(name, str) and name.strip():
            model = (
                await db.execute(select(SemanticModel).where(SemanticModel.name == name.strip()))
            ).scalars().first()
    if model is None:
        model = SemanticModel(
            id=str(uuid.uuid4()), name=(model_doc.get("name") or "Imported model").strip()
        )
        db.add(model)
        await db.flush()
    if isinstance(model_doc.get("description"), str):
        model.description = model_doc["description"]
    if "ai_context" in model_doc:
        model.ai_context = model_doc["ai_context"]

    members: set[str] = set()
    column_count = 0
    field_count = 0
    rel_count = 0
    metric_count = 0

    for entry in model_doc.get("datasets", []) or []:
        if not isinstance(entry, dict):
            continue
        resolved = (
            _resolve_dataset(entry.get("id"), by_id, by_source, by_name)
            or _resolve_dataset(entry.get("source"), by_id, by_source, by_name)
            or _resolve_dataset(entry.get("name"), by_id, by_source, by_name)
        )
        if not resolved:
            warnings.append(f"dataset '{entry.get('name')}': unresolved")
            continue
        members.add(resolved)

        for col in entry.get("columns", []) or []:
            if not isinstance(col, dict) or not col.get("name") or not col.get("description"):
                continue
            row = (
                await db.execute(
                    select(DatasetColumn).where(
                        DatasetColumn.dataset_id == resolved,
                        DatasetColumn.column_name == col["name"],
                    )
                )
            ).scalars().first()
            if row:
                row.description = col["description"]
            else:
                db.add(
                    DatasetColumn(
                        id=str(uuid.uuid4()),
                        dataset_id=resolved,
                        column_name=str(col["name"]),
                        description=str(col["description"]),
                    )
                )
            column_count += 1

        for f in entry.get("fields", []) or []:
            if not isinstance(f, dict) or not f.get("name"):
                continue
            row = (
                await db.execute(
                    select(SemanticModelField).where(
                        SemanticModelField.semantic_model_id == model.id,
                        SemanticModelField.dataset_id == resolved,
                        SemanticModelField.name == f["name"],
                    )
                )
            ).scalars().first()
            if not row:
                row = SemanticModelField(id=str(uuid.uuid4()), semantic_model_id=model.id)
                db.add(row)
            row.dataset_id = resolved
            row.name = f["name"]
            row.column_name = f.get("column")
            row.expression = f.get("expression")
            row.datatype = f.get("datatype")
            row.description = f.get("description")
            row.dimension = f.get("dimension")
            row.entity = f.get("entity")
            row.ai_context = f.get("ai_context")
            field_count += 1

    for rel in model_doc.get("relationships", []) or []:
        from_id = _resolve_dataset(rel.get("from"), by_id, by_source, by_name)
        to_id = _resolve_dataset(rel.get("to"), by_id, by_source, by_name)
        if not from_id or not to_id:
            warnings.append(f"relationship '{rel.get('name')}': unresolved dataset")
            continue
        members.update({from_id, to_id})
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
        row.required = bool(rel.get("required"))
        row.ai_context = rel.get("ai_context")
        rel_count += 1

    for m in model_doc.get("metrics", []) or []:
        base_id = _resolve_dataset(m.get("base_dataset"), by_id, by_source, by_name)
        if not base_id:
            warnings.append(f"metric '{m.get('name')}': unresolved base dataset")
            continue
        members.add(base_id)
        metric_id = m.get("id") if isinstance(m.get("id"), str) else str(uuid.uuid4())
        row = await db.get(MetricDefinition, metric_id)
        if not row:
            row = MetricDefinition(id=metric_id)
            db.add(row)
        row.semantic_model_id = model.id
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

    await db.flush()
    await set_members(db, model.id, sorted(members), enforce_metrics=False)
    return {
        "semantic_model_id": model.id,
        "relationships": rel_count,
        "metrics": metric_count,
        "fields": field_count,
        "columns": column_count,
        "warnings": warnings,
    }


async def import_semantic_model(db: AsyncSession, doc: dict[str, Any]) -> dict[str, Any]:
    """Upsert one or more semantic models (+ fields/metrics) from an Ossie document."""
    raw = doc.get("semantic_model")
    if isinstance(raw, list):
        entries = [e for e in raw if isinstance(e, dict)]
    elif isinstance(raw, dict):
        entries = [raw]
    else:
        entries = [doc]

    by_id, by_source, by_name = await _dataset_index(db)
    model_ids: list[str] = []
    totals = {"relationships": 0, "metrics": 0, "fields": 0, "columns": 0}
    warnings: list[str] = []
    for entry in entries:
        summary = await _import_one_model(db, entry, by_id, by_source, by_name)
        model_ids.append(summary["semantic_model_id"])
        for key in totals:
            totals[key] += summary[key]
        warnings.extend(summary["warnings"])

    await db.commit()
    return {
        "semantic_model_ids": model_ids,
        "semantic_model_id": model_ids[0] if model_ids else None,
        **totals,
        "warnings": warnings,
    }
