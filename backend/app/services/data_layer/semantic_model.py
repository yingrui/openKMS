"""Export / import a semantic model as an **Apache Ossie** document (core spec 0.2.0.dev0).

The document is **flat** (one model per document): `version`, `name`, `datasets`,
`relationships`, `metrics`, and — for our extras — `custom_extensions`
(`vendor_name: "OPENKMS"`). A dataset's `fields[].expression.dialects` is a list;
a field's `dimension` is `{"is_time": bool}`; a relationship is `from` (many) →
`to` (one) with ordered `from_columns`/`to_columns`.

openKMS internals that the core spec has no place for (stable ids, a metric's
`base_dataset` anchor, filters/joins, a relationship's `required`, a field's source
`column`, per-column descriptions) round-trip through the `OPENKMS` custom
extension, so the core shape stays spec-exact.
"""
from __future__ import annotations

import json
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
from app.services.data_layer.expressions import normalize_expression
from app.services.data_layer.semantic_models import member_ids, set_members

OSSIE_VERSION = "0.2.0.dev0"
VENDOR = "OPENKMS"

_OSSIE_DATATYPE = {
    "string": "String",
    "number": "Decimal",
    "integer": "Integer",
    "float": "Float",
    "boolean": "Boolean",
    "datetime": "DateTimeTz",
    "date": "Date",
    "time": "Time",
    "uuid": "String",
}
_ONTOLOGY_DATATYPE = {
    "String": "string",
    "Integer": "number",
    "Decimal": "number",
    "Float": "number",
    "Boolean": "boolean",
    "Date": "datetime",
    "Time": "datetime",
    "DateTime": "datetime",
    "DateTimeTz": "datetime",
}


def _dataset_name(d: Dataset) -> str:
    return d.display_name or f"{d.schema_name}.{d.table_name}"


def _dataset_source(d: Dataset, ds_names: dict[str, str]) -> str:
    return f"{ds_names.get(d.data_source_id)}.{d.schema_name}.{d.table_name}"


def _ossie_datatype(t: str | None) -> str | None:
    return _OSSIE_DATATYPE.get((t or "").lower())


async def export_semantic_model(db: AsyncSession, model: SemanticModel) -> dict[str, Any]:
    """Build the flat Ossie document for one semantic model."""
    members = await member_ids(db, model.id)
    member_set = set(members)
    datasets = (
        (await db.execute(select(Dataset).where(Dataset.id.in_(member_set)))).scalars().all()
        if member_set
        else []
    )
    fields = (
        await db.execute(
            select(SemanticModelField).where(SemanticModelField.semantic_model_id == model.id)
        )
    ).scalars().all()
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
    name_by_id = {d.id: _dataset_name(d) for d in datasets}

    fields_by_dataset: dict[str, list[SemanticModelField]] = {}
    for f in fields:
        fields_by_dataset.setdefault(f.dataset_id, []).append(f)
    columns_by_dataset: dict[str, list[DatasetColumn]] = {}
    for c in columns:
        columns_by_dataset.setdefault(c.dataset_id, []).append(c)

    def rel_name(r: DatasetJoin) -> str:
        return r.name or f"{name_by_id.get(r.from_dataset_id, r.from_dataset_id)}_to_{name_by_id.get(r.to_dataset_id, r.to_dataset_id)}"

    ext: dict[str, Any] = {
        "model_id": model.id,
        "datasets": {
            _dataset_name(d): {
                "id": d.id,
                "columns": [
                    {"name": c.column_name, "description": c.description}
                    for c in columns_by_dataset.get(d.id, [])
                    if c.description
                ],
            }
            for d in datasets
        },
        "fields": {
            _dataset_name(d): {
                f.name: {"id": f.id, "column": f.column_name}
                for f in fields_by_dataset.get(d.id, [])
            }
            for d in datasets
        },
        "relationships": {
            rel_name(r): {"id": r.id, "required": r.required} for r in relationships
        },
        "metrics": {
            m.name: {
                "id": m.id,
                "base_dataset": name_by_id.get(m.base_dataset_id),
                "type": m.type,
                "filters": m.filters,
                "joins": [rel_name(r) for r in relationships if r.id in (m.joins or [])],
            }
            for m in metrics
        },
    }

    doc: dict[str, Any] = {
        "version": OSSIE_VERSION,
        "name": model.name,
        "datasets": [],
        "relationships": [],
        "metrics": [],
        "custom_extensions": [{"vendor_name": VENDOR, "data": json.dumps(ext)}],
    }
    if model.description:
        doc["description"] = model.description
    if model.ai_context:
        doc["ai_context"] = model.ai_context

    for d in datasets:
        entry: dict[str, Any] = {"name": _dataset_name(d), "source": _dataset_source(d, ds_names)}
        if d.primary_key_columns:
            entry["primary_key"] = d.primary_key_columns
        if d.unique_keys:
            entry["unique_keys"] = d.unique_keys
        if d.description:
            entry["description"] = d.description
        if d.ai_context:
            entry["ai_context"] = d.ai_context
        entry["fields"] = []
        for f in fields_by_dataset.get(d.id, []):
            fexpr = normalize_expression(f.expression) or {
                "dialects": [{"dialect": "ANSI_SQL", "expression": f.column_name or f.name}]
            }
            fentry: dict[str, Any] = {"name": f.name, "expression": fexpr}
            if f.dimension:
                fentry["dimension"] = f.dimension
            if f.description:
                fentry["description"] = f.description
            if _ossie_datatype(f.datatype):
                fentry["datatype"] = _ossie_datatype(f.datatype)
            if f.ai_context:
                fentry["ai_context"] = f.ai_context
            entry["fields"].append(fentry)
        doc["datasets"].append(entry)

    for r in relationships:
        rentry: dict[str, Any] = {
            "name": rel_name(r),
            "from": name_by_id.get(r.from_dataset_id, r.from_dataset_id),
            "to": name_by_id.get(r.to_dataset_id, r.to_dataset_id),
            "from_columns": r.from_columns or [],
            "to_columns": r.to_columns or [],
        }
        if r.ai_context:
            rentry["ai_context"] = r.ai_context
        doc["relationships"].append(rentry)

    for m in metrics:
        mentry: dict[str, Any] = {"name": m.name, "expression": normalize_expression(m.expression)}
        if m.business_definition:
            mentry["description"] = m.business_definition
        if _ossie_datatype(m.datatype):
            mentry["datatype"] = _ossie_datatype(m.datatype)
        if m.ai_context:
            mentry["ai_context"] = m.ai_context
        doc["metrics"].append(mentry)

    return doc


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


def _read_extension(doc: dict[str, Any]) -> dict[str, Any]:
    for entry in doc.get("custom_extensions") or []:
        if isinstance(entry, dict) and str(entry.get("vendor_name", "")).lower() == VENDOR.lower():
            try:
                data = json.loads(entry.get("data") or "{}")
                return data if isinstance(data, dict) else {}
            except (ValueError, TypeError):
                return {}
    return {}


async def import_semantic_model(db: AsyncSession, doc: dict[str, Any]) -> dict[str, Any]:
    """Upsert one semantic model (+ fields/metrics/relationships) from a flat Ossie doc."""
    ext = _read_extension(doc)
    by_id, by_source, by_name = await _dataset_index(db)
    warnings: list[str] = []
    name_by_id: dict[str, str] = {}
    id_by_name = {v: k for k, v in by_name.items()}

    # Resolve the target model: extension id → name → new.
    model = await db.get(SemanticModel, ext["model_id"]) if isinstance(ext.get("model_id"), str) else None
    if model is None:
        name = doc.get("name")
        if isinstance(name, str) and name.strip():
            model = (
                await db.execute(select(SemanticModel).where(SemanticModel.name == name.strip()))
            ).scalars().first()
    if model is None:
        model = SemanticModel(id=str(uuid.uuid4()), name=(doc.get("name") or "Imported model").strip())
        db.add(model)
        await db.flush()
    if isinstance(doc.get("description"), str):
        model.description = doc["description"]
    if "ai_context" in doc:
        model.ai_context = doc["ai_context"]

    members: set[str] = set()
    column_count = 0
    field_count = 0
    rel_count = 0
    metric_count = 0

    ds_ext: dict[str, Any] = ext.get("datasets") or {}
    field_ext: dict[str, Any] = ext.get("fields") or {}

    for entry in doc.get("datasets", []) or []:
        if not isinstance(entry, dict):
            continue
        ds_name = entry.get("name")
        resolved = (
            _resolve_dataset(ds_name, by_id, by_source, by_name)
            or _resolve_dataset(entry.get("source"), by_id, by_source, by_name)
        )
        if not resolved:
            warnings.append(f"dataset '{ds_name}': unresolved")
            continue
        members.add(resolved)
        if isinstance(ds_name, str):
            name_by_id[resolved] = ds_name

        for col in (ds_ext.get(ds_name) or {}).get("columns", []) or []:
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

        fields_ext = field_ext.get(ds_name) or {}
        for f in entry.get("fields", []) or []:
            if not isinstance(f, dict) or not f.get("name"):
                continue
            fext = fields_ext.get(f["name"]) or {}
            row = await db.get(SemanticModelField, fext["id"]) if isinstance(fext.get("id"), str) else None
            if row is None:
                row = (
                    await db.execute(
                        select(SemanticModelField).where(
                            SemanticModelField.semantic_model_id == model.id,
                            SemanticModelField.dataset_id == resolved,
                            SemanticModelField.name == f["name"],
                        )
                    )
                ).scalars().first()
            if row is None:
                row = SemanticModelField(id=str(uuid.uuid4()), semantic_model_id=model.id)
                db.add(row)
            row.dataset_id = resolved
            row.name = f["name"]
            row.column_name = fext.get("column")
            row.expression = normalize_expression(f.get("expression"))
            row.datatype = _ONTOLOGY_DATATYPE.get(f.get("datatype") or "") or f.get("datatype")
            row.description = f.get("description")
            row.dimension = f.get("dimension")
            row.ai_context = f.get("ai_context")
            field_count += 1

    rel_ext: dict[str, Any] = ext.get("relationships") or {}
    for rel in doc.get("relationships", []) or []:
        from_id = _resolve_dataset(rel.get("from"), by_id, by_source, by_name)
        to_id = _resolve_dataset(rel.get("to"), by_id, by_source, by_name)
        if not from_id or not to_id:
            warnings.append(f"relationship '{rel.get('name')}': unresolved dataset")
            continue
        members.update({from_id, to_id})
        rext = rel_ext.get(rel.get("name")) or {}
        rel_id = rext.get("id") if isinstance(rext.get("id"), str) else str(uuid.uuid4())
        row = await db.get(DatasetJoin, rel_id)
        if not row:
            row = DatasetJoin(id=rel_id)
            db.add(row)
        row.name = rel.get("name")
        row.from_dataset_id = from_id
        row.to_dataset_id = to_id
        row.from_columns = rel.get("from_columns") or []
        row.to_columns = rel.get("to_columns") or []
        row.required = bool(rext.get("required"))
        row.ai_context = rel.get("ai_context")
        rel_count += 1

    metric_ext: dict[str, Any] = ext.get("metrics") or {}
    for m in doc.get("metrics", []) or []:
        mext = metric_ext.get(m.get("name")) or {}
        base_ref = mext.get("base_dataset")
        base_id = _resolve_dataset(base_ref, by_id, by_source, by_name)
        if not base_id:
            warnings.append(f"metric '{m.get('name')}': unresolved base dataset")
            continue
        members.add(base_id)
        metric_id = mext.get("id") if isinstance(mext.get("id"), str) else str(uuid.uuid4())
        row = await db.get(MetricDefinition, metric_id)
        if not row:
            row = MetricDefinition(id=metric_id)
            db.add(row)
        row.semantic_model_id = model.id
        row.base_dataset_id = base_id
        row.name = m.get("name") or "metric"
        row.type = mext.get("type") or "simple"
        row.business_definition = m.get("description")
        row.expression = normalize_expression(m.get("expression"))
        row.datatype = _ONTOLOGY_DATATYPE.get(m.get("datatype") or "") or m.get("datatype")
        row.filters = mext.get("filters")
        joins = mext.get("joins") or []
        row.joins = [
            (rel_ext.get(r, {}) or {}).get("id") for r in joins if isinstance(r, str)
        ]
        row.joins = [j for j in row.joins if isinstance(j, str)]
        row.ai_context = m.get("ai_context")
        metric_count += 1

    await db.flush()
    await set_members(db, model.id, sorted(members), enforce_metrics=False)
    await db.commit()
    return {
        "semantic_model_id": model.id,
        "relationships": rel_count,
        "metrics": metric_count,
        "fields": field_count,
        "columns": column_count,
        "warnings": warnings,
    }
