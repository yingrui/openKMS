"""Create PostgreSQL tables and dataset rows for sync connector output slots."""

from __future__ import annotations

import re
import uuid
from typing import Any

from sqlalchemy import create_engine, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.services.connectors.connector_catalog import get_kind_spec
from app.services.connectors.dataset_schemas import ConnectorDatasetColumn
from app.services.credentials.credential_encryption import decrypt
from app.services.acl.data_scope import bootstrap_owner_acl
from app.services.acl.resource_acl_constants import RT_DATASET
from urllib.parse import quote_plus

_IDENTIFIER = re.compile(r"^[a-zA-Z0-9_]+$")


def _pg_engine_for_datasource(ds: DataSource):
    username = decrypt(ds.username_encrypted) if ds.username_encrypted else ""
    password = decrypt(ds.password_encrypted) if ds.password_encrypted else ""
    password_escaped = quote_plus(password) if password else ""
    url = (
        f"postgresql://{username}:{password_escaped}@{ds.host}:{ds.port or 5432}"
        f"/{ds.database or 'postgres'}"
    )
    return create_engine(url, pool_pre_ping=True, pool_recycle=10)


def _validate_identifier(name: str, label: str) -> str:
    s = (name or "").strip()
    if not s or not _IDENTIFIER.match(s):
        raise ValueError(f"{label} must contain only letters, numbers, and underscores.")
    return s


def _quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def get_output_slot(kind: str, slot: str):
    spec = get_kind_spec(kind)
    if not spec:
        raise ValueError(f"Unknown connector kind '{kind}'.")
    for o in spec.output_slots:
        if o.slot == slot:
            return o
    raise ValueError(f"Unknown output slot '{slot}' for connector kind '{kind}'.")


def build_create_table_ddl(
    pg_schema: str,
    table_name: str,
    columns: tuple[ConnectorDatasetColumn, ...],
) -> str:
    if not columns:
        raise ValueError("Dataset schema has no columns.")
    col_defs: list[str] = []
    pk_cols: list[str] = []
    for col in columns:
        null_sql = "" if col.nullable else " NOT NULL"
        col_defs.append(f"{_quote_ident(col.name)} {col.pg_type}{null_sql}")
        if col.primary_key:
            pk_cols.append(_quote_ident(col.name))
    if pk_cols:
        col_defs.append(f"PRIMARY KEY ({', '.join(pk_cols)})")
    schema_q = _quote_ident(pg_schema)
    table_q = _quote_ident(table_name)
    return (
        f"CREATE SCHEMA IF NOT EXISTS {schema_q};\n"
        f"CREATE TABLE IF NOT EXISTS {schema_q}.{table_q} (\n  "
        + ",\n  ".join(col_defs)
        + "\n);"
    )


def _normalize_pg_type(data_type: str) -> str:
    dt = (data_type or "").upper()
    if dt in ("CHARACTER VARYING", "VARCHAR"):
        return "TEXT"
    if dt == "DOUBLE PRECISION":
        return "NUMERIC"
    return dt


def _fetch_table_columns(engine, pg_schema: str, table_name: str) -> dict[str, str]:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT column_name, data_type, udt_name
                FROM information_schema.columns
                WHERE table_schema = :schema AND table_name = :table
                ORDER BY ordinal_position
                """
            ),
            {"schema": pg_schema, "table": table_name},
        ).fetchall()
    out: dict[str, str] = {}
    for row in rows:
        name = str(row[0])
        data_type = _normalize_pg_type(str(row[1]))
        udt = str(row[2] or "").upper()
        if data_type == "USER-DEFINED" and udt:
            data_type = udt
        if data_type == "INT4":
            data_type = "INTEGER"
        if data_type == "INT2":
            data_type = "SMALLINT"
        out[name] = data_type
    return out


def validate_table_columns(
    existing: dict[str, str],
    required: tuple[ConnectorDatasetColumn, ...],
) -> list[str]:
    """Return human-readable compatibility errors (empty if ok)."""
    errors: list[str] = []
    for col in required:
        if col.name not in existing:
            errors.append(f"missing column '{col.name}'")
            continue
        actual = existing[col.name]
        expected = col.pg_type.upper()
        if actual == expected:
            continue
        if expected == "NUMERIC" and actual in ("NUMERIC", "DOUBLE PRECISION"):
            continue
        if expected.startswith("NUMERIC(") and actual == "NUMERIC":
            continue
        if expected == "VARCHAR(10)" and actual in ("VARCHAR", "TEXT", "CHARACTER VARYING"):
            continue
        if expected == "VARCHAR(24)" and actual in ("VARCHAR", "TEXT", "CHARACTER VARYING"):
            continue
        if expected == "VARCHAR(12)" and actual in ("VARCHAR", "TEXT", "CHARACTER VARYING"):
            continue
        errors.append(f"column '{col.name}' has type {actual}, expected {expected}")
    return errors


async def validate_dataset_for_slot(
    db: AsyncSession,
    *,
    kind: str,
    slot: str,
    dataset_id: str,
) -> None:
    slot_spec = get_output_slot(kind, slot)
    if not slot_spec.dataset_columns:
        return
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise ValueError(f"Dataset not found: {dataset_id}")
    ds = await db.get(DataSource, dataset.data_source_id)
    if not ds:
        raise ValueError(f"Data source not found for dataset {dataset_id}")
    if ds.kind != "postgresql":
        raise ValueError(f"Dataset {dataset_id} is not on a PostgreSQL data source.")
    engine = _pg_engine_for_datasource(ds)
    try:
        cols = _fetch_table_columns(engine, dataset.schema_name, dataset.table_name)
    finally:
        engine.dispose()
    if not cols:
        raise ValueError(
            f"Dataset table {dataset.schema_name}.{dataset.table_name} does not exist "
            f"or has no columns; use provision to create a compatible table."
        )
    issues = validate_table_columns(cols, slot_spec.dataset_columns)
    if issues:
        raise ValueError(
            f"Dataset '{dataset.display_name or dataset.table_name}' is incompatible with "
            f"slot '{slot}': {'; '.join(issues)}."
        )


async def validate_connector_outputs(db: AsyncSession, kind: str, outputs: dict[str, str]) -> None:
    for slot, dataset_id in outputs.items():
        await validate_dataset_for_slot(db, kind=kind, slot=slot, dataset_id=dataset_id)


async def provision_dataset_for_slot(
    db: AsyncSession,
    *,
    kind: str,
    slot: str,
    data_source_id: str,
    schema_name: str | None,
    table_name: str | None,
    display_name: str | None,
    created_by: str | None,
    created_by_name: str | None,
) -> Dataset:
    slot_spec = get_output_slot(kind, slot)
    if not slot_spec.dataset_columns:
        raise ValueError(f"Slot '{slot}' has no dataset schema; cannot provision.")

    ds = await db.get(DataSource, data_source_id)
    if not ds:
        raise ValueError("Data source not found")
    if ds.kind != "postgresql":
        raise ValueError("Only PostgreSQL data sources support connector dataset provision.")

    pg_schema = _validate_identifier(
        schema_name or slot_spec.default_pg_schema or "public",
        "Schema name",
    )
    pg_table = _validate_identifier(table_name or slot_spec.default_table_name or slot, "Table name")

    existing = await db.execute(
        select(Dataset).where(
            Dataset.data_source_id == data_source_id,
            Dataset.schema_name == pg_schema,
            Dataset.table_name == pg_table,
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError(
            f"A dataset is already registered for {pg_schema}.{pg_table} on this data source."
        )

    ddl = build_create_table_ddl(pg_schema, pg_table, slot_spec.dataset_columns)
    engine = _pg_engine_for_datasource(ds)
    try:
        with engine.begin() as conn:
            conn.execute(text(ddl))
        cols = _fetch_table_columns(engine, pg_schema, pg_table)
        issues = validate_table_columns(cols, slot_spec.dataset_columns)
        if issues:
            raise ValueError(f"Provisioned table failed validation: {'; '.join(issues)}")
    finally:
        engine.dispose()

    label = (display_name or "").strip() or slot_spec.label
    dataset = Dataset(
        id=str(uuid.uuid4()),
        data_source_id=data_source_id,
        schema_name=pg_schema,
        table_name=pg_table,
        display_name=label[:256],
        created_by=created_by,
        created_by_name=created_by_name[:256] if created_by_name else None,
    )
    db.add(dataset)
    await db.flush()
    if created_by:
        await bootstrap_owner_acl(db, RT_DATASET, dataset.id, created_by)
    await db.refresh(dataset)
    return dataset


def slot_schema_dict(columns: tuple[ConnectorDatasetColumn, ...]) -> list[dict[str, Any]]:
    return [
        {
            "name": c.name,
            "pg_type": c.pg_type,
            "nullable": c.nullable,
            "primary_key": c.primary_key,
        }
        for c in columns
    ]
