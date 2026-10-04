"""Read access to PostgreSQL tables behind datasets (row counts, paged rows)."""

from __future__ import annotations

import re
from urllib.parse import quote_plus

from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.services.credentials.credential_encryption import decrypt
from app.services.ontology.property_types import serialize_cell_value

_IDENTIFIER = re.compile(r"^[a-zA-Z0-9_]+$")


def pg_engine_for_datasource(ds: DataSource):
    """Create a sync SQLAlchemy engine for a PostgreSQL data source."""
    username = decrypt(ds.username_encrypted) if ds.username_encrypted else ""
    password = decrypt(ds.password_encrypted) if ds.password_encrypted else ""
    password_escaped = quote_plus(password) if password else ""
    url = (
        f"postgresql://{username}:{password_escaped}@{ds.host}:{ds.port or 5432}"
        f"/{ds.database or 'postgres'}"
    )
    return create_engine(url, pool_pre_ping=True, pool_recycle=10)


def is_valid_identifier(name: str) -> bool:
    """Schema/table/column names are interpolated into SQL, so only allow [A-Za-z0-9_]."""
    return bool(_IDENTIFIER.match(name))


async def dataset_display_name(db: AsyncSession, dataset_id: str | None) -> str | None:
    if not dataset_id:
        return None
    ds = await db.get(Dataset, dataset_id)
    if not ds:
        return None
    return ds.display_name or f"{ds.schema_name}.{ds.table_name}"


async def _pg_dataset_source(db: AsyncSession, dataset_id: str) -> tuple[Dataset, DataSource] | None:
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        return None
    ds = await db.get(DataSource, dataset.data_source_id)
    if not ds or ds.kind != "postgresql":
        return None
    if not is_valid_identifier(dataset.schema_name) or not is_valid_identifier(dataset.table_name):
        return None
    return dataset, ds


async def get_dataset_row_count(db: AsyncSession, dataset_id: str) -> int:
    """Row count for a dataset table. Returns 0 if dataset not found or on error."""
    resolved = await _pg_dataset_source(db, dataset_id)
    if not resolved:
        return 0
    dataset, ds = resolved
    try:
        engine = pg_engine_for_datasource(ds)
        with engine.connect() as conn:
            quoted = f'"{dataset.schema_name}"."{dataset.table_name}"'
            total = conn.execute(text(f"SELECT COUNT(*) FROM {quoted}")).scalar() or 0
        engine.dispose()
        return int(total)
    except Exception:
        return 0


async def get_dataset_row_count_where_not_null(
    db: AsyncSession, dataset_id: str, column_name: str
) -> int:
    """Count rows where column is not null. Returns 0 if dataset not found or on error."""
    resolved = await _pg_dataset_source(db, dataset_id)
    if not resolved or not is_valid_identifier(column_name):
        return 0
    dataset, ds = resolved
    try:
        engine = pg_engine_for_datasource(ds)
        with engine.connect() as conn:
            quoted = f'"{dataset.schema_name}"."{dataset.table_name}"'
            total = conn.execute(
                text(f'SELECT COUNT(*) FROM {quoted} WHERE "{column_name}" IS NOT NULL')
            ).scalar() or 0
        engine.dispose()
        return int(total)
    except Exception:
        return 0


async def fetch_dataset_rows(
    db: AsyncSession, dataset_id: str, limit: int = 500, offset: int = 0
) -> tuple[list[dict], int]:
    """Fetch rows from dataset table. Returns (rows, total). Raises ValueError on bad dataset."""
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise ValueError("Dataset not found")
    ds = await db.get(DataSource, dataset.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise ValueError("Dataset rows only supported for PostgreSQL sources")
    schema, table = dataset.schema_name, dataset.table_name
    if not is_valid_identifier(schema) or not is_valid_identifier(table):
        raise ValueError("Invalid schema or table name")
    quoted = f'"{schema}"."{table}"'
    engine = pg_engine_for_datasource(ds)
    try:
        with engine.connect() as conn:
            total = conn.execute(text(f"SELECT COUNT(*) FROM {quoted}")).scalar() or 0
            rows_result = conn.execute(
                text(f"SELECT * FROM {quoted} LIMIT :limit OFFSET :offset"),
                {"limit": limit, "offset": offset},
            )
            columns = list(rows_result.keys())
            rows = [
                {k: serialize_cell_value(v) for k, v in zip(columns, r)}
                for r in rows_result.fetchall()
            ]
        return rows, int(total)
    finally:
        engine.dispose()
