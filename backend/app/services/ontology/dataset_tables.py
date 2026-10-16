"""Read access to PostgreSQL tables behind datasets (row counts, paged rows)."""

from __future__ import annotations

import re
from urllib.parse import quote_plus

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.pool import NullPool

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.services.credentials.credential_encryption import decrypt
from app.services.ontology.property_types import serialize_cell_value

_IDENTIFIER = re.compile(r"^[a-zA-Z0-9_]+$")


def pg_engine_for_datasource(ds: DataSource):
    """Create a sync SQLAlchemy engine for a PostgreSQL data source.

    Uses ``NullPool`` so each engine holds **zero** pooled connections — a connection
    is opened on ``connect()`` and closed on exit. Creating a default QueuePool
    (pool_size=5 + overflow=10) per request let concurrent data-layer calls exhaust
    the server's ``max_connections``.
    """
    username = decrypt(ds.username_encrypted) if ds.username_encrypted else ""
    password = decrypt(ds.password_encrypted) if ds.password_encrypted else ""
    password_escaped = quote_plus(password) if password else ""
    url = (
        f"postgresql://{username}:{password_escaped}@{ds.host}:{ds.port or 5432}"
        f"/{ds.database or 'postgres'}"
    )
    return create_engine(url, poolclass=NullPool)


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


async def resolve_pg_dataset_source(
    db: AsyncSession, dataset_id: str
) -> tuple[Dataset, DataSource] | None:
    """A dataset **and** its PostgreSQL source, or None when it is not a readable table."""
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
    resolved = await resolve_pg_dataset_source(db, dataset_id)
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
    except (SQLAlchemyError, OSError, ValueError, TypeError):
        return 0


async def get_dataset_row_count_where_not_null(
    db: AsyncSession, dataset_id: str, column_name: str
) -> int:
    """Count rows where column is not null. Returns 0 if dataset not found or on error."""
    resolved = await resolve_pg_dataset_source(db, dataset_id)
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
    except (SQLAlchemyError, OSError, ValueError, TypeError):
        return 0


async def fetch_dataset_rows(
    db: AsyncSession, dataset_id: str, limit: int = 500, offset: int = 0
) -> tuple[list[dict], int]:
    """Fetch rows from dataset table. Returns (rows, total). Raises ValueError on bad dataset."""
    rows, total, _ = await fetch_dataset_rows_page(db, dataset_id, limit=limit, offset=offset)
    return rows, total


def keyset_cursor_error(sort: str | None, after: str | None) -> str | None:
    """`after` is the last value of `sort`; without a usable sort column it means nothing.

    Returning the message (instead of silently falling back to OFFSET) keeps a paging caller from
    asking for "the page after X" and being handed the first page again.
    """
    if after in (None, ""):
        return None
    if not (sort and is_valid_identifier(str(sort))):
        return "`after` requires `sort` (the cursor is the last value of that column)."
    return None


def table_column_names(ds: DataSource, schema: str, table: str) -> list[str]:
    """The table's columns, in ordinal order — what a browsing reader validates filters against.

    (Callers that also need types/descriptions use the metadata endpoint, which queries the same
    view with more columns.)
    """
    engine = pg_engine_for_datasource(ds)
    try:
        with engine.connect() as conn:
            return [
                str(row[0])
                for row in conn.execute(
                    text(
                        """
                        SELECT column_name FROM information_schema.columns
                        WHERE table_schema = :schema AND table_name = :table
                        ORDER BY ordinal_position
                        """
                    ),
                    {"schema": schema, "table": table},
                ).fetchall()
            ]
    finally:
        engine.dispose()


async def fetch_dataset_rows_page(
    db: AsyncSession,
    dataset_id: str,
    limit: int = 500,
    offset: int = 0,
    *,
    sort: str | None = None,
    order: str = "asc",
    after: str | None = None,
) -> tuple[list[dict], int, str | None]:
    """Fetch rows with optional server-side sort and **keyset** paging.

    Returns ``(rows, total, next_after)``. When ``sort`` is a valid column, rows are
    ordered by it; passing ``after`` switches to keyset pagination
    (``WHERE sort > after`` for asc) — stable and fast on large tables. Otherwise
    ``OFFSET`` is used. Raises ValueError on a bad dataset.
    """
    if (cursor_error := keyset_cursor_error(sort, after)) is not None:
        raise ValueError(cursor_error)
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

    valid_sort = bool(sort and is_valid_identifier(str(sort)))
    direction = "DESC" if str(order).lower() == "desc" else "ASC"
    use_keyset = bool(valid_sort and after not in (None, ""))
    order_sql = f' ORDER BY "{sort}" {direction}' if valid_sort else ""
    where_sql = ""
    params: dict[str, object] = {"limit": limit}
    if use_keyset:
        op = "<" if direction == "DESC" else ">"
        where_sql = f' WHERE "{sort}" {op} :after'
        params["after"] = after
    else:
        params["offset"] = offset
    sql = f"SELECT * FROM {quoted}{where_sql}{order_sql} LIMIT :limit"
    if not use_keyset:
        sql += " OFFSET :offset"

    engine = pg_engine_for_datasource(ds)
    try:
        with engine.connect() as conn:
            total = conn.execute(text(f"SELECT COUNT(*) FROM {quoted}")).scalar() or 0
            rows_result = conn.execute(text(sql), params)
            columns = list(rows_result.keys())
            rows = [
                {k: serialize_cell_value(v) for k, v in zip(columns, r, strict=True)}
                for r in rows_result.fetchall()
            ]
        next_after = None
        if valid_sort and rows:
            candidate = rows[-1].get(str(sort))
            next_after = None if candidate is None else str(candidate)
        return rows, int(total), next_after
    finally:
        engine.dispose()
