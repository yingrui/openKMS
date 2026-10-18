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
from app.services.ontology.property_types import (
    normalize_postgresql_column_type,
    serialize_cell_value,
)

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
    db: AsyncSession,
    dataset_id: str,
    limit: int = 500,
    offset: int = 0,
    *,
    filters: dict[str, str] | None = None,
    search: str | None = None,
    not_null: list[str] | None = None,
) -> tuple[list[dict], int]:
    """Fetch rows from dataset table. Returns (rows, total). Raises ValueError on bad dataset."""
    rows, total, _ = await fetch_dataset_rows_page(
        db,
        dataset_id,
        limit=limit,
        offset=offset,
        filters=filters,
        search=search,
        not_null=not_null,
    )
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


def table_column_names_on(conn, schema: str, table: str) -> list[str]:
    """The table's columns in ordinal order, read on an already-open connection."""
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


def table_column_names(ds: DataSource, schema: str, table: str) -> list[str]:
    """The table's columns, in ordinal order — what a browsing reader validates filters against.

    (Callers that also need types/descriptions use the metadata endpoint, which queries the same
    view with more columns.)
    """
    engine = pg_engine_for_datasource(ds)
    try:
        with engine.connect() as conn:
            return table_column_names_on(conn, schema, table)
    finally:
        engine.dispose()


def dataset_row_where(
    *,
    columns: list[str],
    filters: dict[str, str] | None = None,
    search: str | None = None,
    not_null: list[str] | None = None,
) -> tuple[str, dict[str, object]]:
    """The predicate (and params) for reading a table *as object instances*.

    Column names are interpolated into SQL, so each one is validated first; values are always
    parameters. Equality compares ``CAST("col" AS TEXT)``: a query-string filter must match a
    numeric / date / boolean column, which is also what the Neo4j path does with ``toString``.

    ``search`` needs ``columns`` (the table's live column list) — it is a substring match across
    every column, the same sweep ``query_neo4j_nodes`` does over node keys.
    ``not_null`` lists columns a row must fill to count at all (a FK row *is* a link).
    """
    parts: list[str] = []
    params: dict[str, object] = {}
    for column in not_null or []:
        if not is_valid_identifier(column):
            raise ValueError(f"Invalid required column: {column!r}")
        parts.append(f'"{column}" IS NOT NULL')
    for i, (column, value) in enumerate((filters or {}).items()):
        if not is_valid_identifier(column):
            raise ValueError(f"Invalid property filter column: {column!r}")
        parts.append(f'CAST("{column}" AS TEXT) = :filter_{i}')
        params[f"filter_{i}"] = value
    needle = (search or "").strip()
    if needle:
        searchable = [c for c in columns if is_valid_identifier(c)]
        if searchable:
            parts.append(
                "(" + " OR ".join(f'CAST("{c}" AS TEXT) ILIKE :search' for c in searchable) + ")"
            )
            params["search"] = f"%{needle}%"
    return " AND ".join(parts), params


def table_column_types(ds: DataSource, schema: str, table: str) -> dict[str, str]:
    """The table's columns and their normalized types — time granularity is only valid on a date."""
    engine = pg_engine_for_datasource(ds)
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    """
                    SELECT column_name, data_type, udt_name FROM information_schema.columns
                    WHERE table_schema = :schema AND table_name = :table
                    ORDER BY ordinal_position
                    """
                ),
                {"schema": schema, "table": table},
            ).fetchall()
        return {
            str(name): normalize_postgresql_column_type(str(data_type), str(udt or ""))
            for name, data_type, udt in rows
        }
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
    filters: dict[str, str] | None = None,
    search: str | None = None,
    not_null: list[str] | None = None,
) -> tuple[list[dict], int, str | None]:
    """Fetch rows with optional server-side sort, **keyset** paging, and **WHERE pushdown**.

    Returns ``(rows, total, next_after)``. When ``sort`` is a valid column, rows are
    ordered by it; passing ``after`` switches to keyset pagination
    (``WHERE sort > after`` for asc) — stable and fast on large tables. Otherwise
    ``OFFSET`` is used. Raises ValueError on a bad dataset.

    ``filters`` / ``search`` are pushed into SQL so ``total`` and the page agree (the object
    list used to filter one page in memory, which silently broke both). See
    :func:`dataset_row_where` for the comparison rules.
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
    params: dict[str, object] = {"limit": limit}

    engine = pg_engine_for_datasource(ds)
    try:
        with engine.connect() as conn:
            columns_known = (
                table_column_names_on(conn, schema, table) if (search or "").strip() else []
            )
            filter_sql, filter_params = dataset_row_where(
                columns=columns_known, filters=filters, search=search, not_null=not_null
            )
            params.update(filter_params)
            where_parts: list[str] = [filter_sql] if filter_sql else []
            if use_keyset:
                op = "<" if direction == "DESC" else ">"
                where_parts.append(f'"{sort}" {op} :after')
                params["after"] = after
            else:
                params["offset"] = offset
            where_sql = f" WHERE {' AND '.join(where_parts)}" if where_parts else ""

            total = conn.execute(
                text(f"SELECT COUNT(*) FROM {quoted}{where_sql}"),
                {k: v for k, v in params.items() if k not in ("limit", "offset")},
            ).scalar() or 0
            sql = f"SELECT * FROM {quoted}{where_sql}{order_sql} LIMIT :limit"
            if not use_keyset:
                sql += " OFFSET :offset"
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
