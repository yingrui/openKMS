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
import re
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
from app.services.data_layer.expressions import ANSI, dialect_sql, normalize_expression
from app.services.data_layer.semantic_model_fields import OSSIE_DATATYPES
from app.services.data_layer.semantic_models import member_ids, set_members
from app.services.ontology.dataset_tables import is_valid_identifier

OSSIE_VERSION = "0.2.0.dev0"
VENDOR = "OPENKMS"

# Legacy internal names -> the spec's DataType enum (stored values are already the enum).
_OSSIE_DATATYPE = {
    "string": "String",
    "number": "Decimal",
    "integer": "Integer",
    "float": "Float",
    "boolean": "Boolean",
    "datetime": "DateTimeTz",
    "datetimetz": "DateTimeTz",
    "date": "Date",
    "time": "Time",
    "uuid": "String",
}


def _dataset_name(d: Dataset) -> str:
    return d.display_name or f"{d.schema_name}.{d.table_name}"


def _dataset_source(d: Dataset, ds_names: dict[str, str]) -> str:
    return f"{ds_names.get(d.data_source_id)}.{d.schema_name}.{d.table_name}"


# A plain column reference we may write unquoted (the spec's own examples do):
# lowercase, identifier-shaped, and not a reserved word a consumer might misread.
_SIMPLE_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")
_SQL_RESERVED = frozenset(
    """
    all and any array as asc asymmetric both case cast check collate column constraint
    create current_date current_time current_timestamp current_user default deferrable
    desc distinct do else end except false fetch for foreign from grant group having in
    initially intersect into lateral leading limit localtime not null offset on only or
    order placing primary references returning select session_user some symmetric table
    then to trailing true union unique user using variadic when where window with
    """.split()
)


def _plain_column_expression(expression: dict | None, column: str | None) -> str | None:
    """The bare column name when the stored expression is *just* that column.

    Returns None when the expression is computed, or when the column needs quoting (mixed
    case, punctuation, a reserved word) — then the expression is emitted verbatim.
    """
    if not column or column in _SQL_RESERVED or not _SIMPLE_IDENTIFIER.fullmatch(column):
        return None
    sql = dialect_sql(expression, ANSI)
    if sql and sql.strip() in (column, f'"{column}"'):
        return column
    return None


def _ossie_datatype(t: str | None) -> str | None:
    """The spec's `DataType`: stored as the enum already; tolerate legacy names."""
    if not t:
        return None
    if t in OSSIE_DATATYPES:
        return t
    return _OSSIE_DATATYPE.get(t.lower())




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

    # Key order follows the spec's schema table (version, name, description, ai_context, …).
    doc: dict[str, Any] = {"version": OSSIE_VERSION, "name": model.name}
    if model.description:
        doc["description"] = model.description
    if model.ai_context:
        doc["ai_context"] = model.ai_context
    doc["datasets"] = []
    doc["relationships"] = []
    doc["metrics"] = []

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
        # Column descriptions have no home in the spec (its fields are model-scoped).
        column_notes = {
            c.column_name: c.description
            for c in columns_by_dataset.get(d.id, [])
            if c.description
        }
        if column_notes:
            entry["custom_extensions"] = _extension({"columns": column_notes})

        entry["fields"] = []
        for f in fields_by_dataset.get(d.id, []):
            simple = _plain_column_expression(f.expression, f.column_name)
            fexpr = (
                {"dialects": [{"dialect": "ANSI_SQL", "expression": simple}]}
                if simple
                else normalize_expression(f.expression)
                or {"dialects": [{"dialect": "ANSI_SQL", "expression": f.column_name or f.name}]}
            )
            fentry: dict[str, Any] = {"name": f.name, "expression": fexpr}
            if f.dimension:
                fentry["dimension"] = f.dimension
            if f.label:
                fentry["label"] = f.label
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
        # `required` (INNER vs LEFT) is ours; the spec has no such field.
        if r.required:
            rentry["custom_extensions"] = _extension({"required": True})
        doc["relationships"].append(rentry)

    for m in metrics:
        mentry: dict[str, Any] = {"name": m.name, "expression": normalize_expression(m.expression)}
        if m.business_definition:
            mentry["description"] = m.business_definition
        if _ossie_datatype(m.datatype):
            mentry["datatype"] = _ossie_datatype(m.datatype)
        if m.ai_context:
            mentry["ai_context"] = m.ai_context
        # The spec derives the FROM/join path from the expression; we keep the anchor (§24).
        mentry["custom_extensions"] = _extension(
            {
                "base_dataset": name_by_id.get(m.base_dataset_id),
                "type": m.type if m.type and m.type != "simple" else None,
                "filters": m.filters,
                "joins": [rel_name(r) for r in relationships if r.id in (m.joins or [])],
            }
        )
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


def _extension(data: dict[str, Any]) -> list[dict[str, str]]:
    """An entity-level `OPENKMS` extension — only what the core spec cannot express.

    Redundant values are dropped (`required: false` is our default; empty filters/joins
    say nothing), so the extension is absent when it would carry nothing.
    """
    clean = {k: v for k, v in data.items() if v}
    return [{"vendor_name": VENDOR, "data": json.dumps(clean, ensure_ascii=False)}] if clean else []


def _entity_extension(entity: dict[str, Any]) -> dict[str, Any]:
    """Read back the `OPENKMS` `data` object attached to a dataset/relationship/metric."""
    for entry in entity.get("custom_extensions") or []:
        if isinstance(entry, dict) and str(entry.get("vendor_name", "")).lower() == VENDOR.lower():
            try:
                data = json.loads(entry.get("data") or "{}")
            except (ValueError, TypeError):
                return {}
            return data if isinstance(data, dict) else {}
    return {}


def _source_column(expression: Any) -> str | None:
    """Our storage keeps the source column beside the expression; a bare `"col"` back tells us."""
    sql = dialect_sql(normalize_expression(expression), ANSI)
    if not sql:
        return None
    bare = sql.strip().strip(";").strip()
    if len(bare) >= 2 and bare[0] == bare[-1] == '"':
        bare = bare[1:-1]
    return bare if is_valid_identifier(bare) else None


async def import_semantic_model(db: AsyncSession, doc: dict[str, Any]) -> dict[str, Any]:
    """Upsert one semantic model (+ fields/metrics/relationships) from a flat Ossie doc.

    Everything is matched **by name** (datasets by `source` first) — the document has no ids,
    so a round-trip into the same instance updates in place and one into another instance
    creates the entities afresh.
    """
    by_id, by_source, by_name = await _dataset_index(db)
    warnings: list[str] = []
    name_by_id: dict[str, str] = {}
    rel_ids_by_name: dict[str, str] = {}

    name = doc.get("name")
    model = None
    if isinstance(name, str) and name.strip():
        model = (
            await db.execute(select(SemanticModel).where(SemanticModel.name == name.strip()))
        ).scalars().first()
    if model is None:
        model = SemanticModel(
            id=str(uuid.uuid4()), name=(doc.get("name") or "Imported model").strip()
        )
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

        for col_name, col_desc in (_entity_extension(entry).get("columns") or {}).items():
            if not isinstance(col_name, str) or not col_desc:
                continue
            row = (
                await db.execute(
                    select(DatasetColumn).where(
                        DatasetColumn.dataset_id == resolved,
                        DatasetColumn.column_name == col_name,
                    )
                )
            ).scalars().first()
            if row:
                row.description = str(col_desc)
            else:
                db.add(
                    DatasetColumn(
                        id=str(uuid.uuid4()),
                        dataset_id=resolved,
                        column_name=col_name,
                        description=str(col_desc),
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
            if row is None:
                row = SemanticModelField(id=str(uuid.uuid4()), semantic_model_id=model.id)
                db.add(row)
            row.dataset_id = resolved
            row.name = f["name"]
            row.column_name = _source_column(f.get("expression"))
            row.expression = normalize_expression(f.get("expression"))
            row.datatype = f.get("datatype")
            row.label = f.get("label")
            row.description = f.get("description")
            row.dimension = f.get("dimension")
            row.ai_context = f.get("ai_context")
            field_count += 1

    for rel in doc.get("relationships", []) or []:
        from_id = _resolve_dataset(rel.get("from"), by_id, by_source, by_name)
        to_id = _resolve_dataset(rel.get("to"), by_id, by_source, by_name)
        if not from_id or not to_id:
            warnings.append(f"relationship '{rel.get('name')}': unresolved dataset")
            continue
        members.update({from_id, to_id})
        row = (
            await db.execute(select(DatasetJoin).where(DatasetJoin.name == rel.get("name")))
        ).scalars().first()
        if not row:
            row = DatasetJoin(id=str(uuid.uuid4()))
            db.add(row)
        row.name = rel.get("name")
        row.from_dataset_id = from_id
        row.to_dataset_id = to_id
        row.from_columns = rel.get("from_columns") or []
        row.to_columns = rel.get("to_columns") or []
        row.required = bool(_entity_extension(rel).get("required"))
        row.ai_context = rel.get("ai_context")
        rel_ids_by_name[str(row.name)] = row.id
        rel_count += 1

    for m in doc.get("metrics", []) or []:
        if not isinstance(m, dict):
            continue
        mext = _entity_extension(m)
        base_id = _resolve_dataset(mext.get("base_dataset"), by_id, by_source, by_name)
        if not base_id:
            warnings.append(f"metric '{m.get('name')}': unresolved base dataset")
            continue
        members.add(base_id)
        row = (
            await db.execute(
                select(MetricDefinition).where(
                    MetricDefinition.semantic_model_id == model.id,
                    MetricDefinition.name == m.get("name"),
                )
            )
        ).scalars().first()
        if not row:
            row = MetricDefinition(id=str(uuid.uuid4()))
            db.add(row)
        row.semantic_model_id = model.id
        row.base_dataset_id = base_id
        row.name = m.get("name") or "metric"
        row.type = mext.get("type") or "simple"
        row.business_definition = m.get("description")
        row.expression = normalize_expression(m.get("expression"))
        row.datatype = m.get("datatype")
        row.filters = mext.get("filters")
        row.joins = [
            rel_ids_by_name[r]
            for r in (mext.get("joins") or [])
            if isinstance(r, str) and r in rel_ids_by_name
        ]
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
