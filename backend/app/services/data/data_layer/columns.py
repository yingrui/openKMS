"""Dataset columns — live physical metadata + maintained annotations (description).

Columns themselves come from `information_schema` at read time; only the added
annotations (today: `description`) are stored, so nothing goes stale.
"""
from __future__ import annotations

import asyncio
import time
import uuid
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.models.dataset_column import DatasetColumn
from app.services.ontology.dataset_tables import is_valid_identifier, pg_engine_for_datasource
from app.services.ontology.property_types import (
    map_source_type_to_ontology,
    normalize_postgresql_column_type,
)


class ColumnError(ValueError):
    """Raised for invalid column operations; surfaced as HTTP 400."""


_COLUMN_SQL = text(
    "SELECT column_name, data_type, udt_name, is_nullable, ordinal_position "
    "FROM information_schema.columns "
    "WHERE table_schema = :s AND table_name = :t "
    "ORDER BY ordinal_position"
)

#: Column names are read once per table per TTL instead of once per **query**.
#:
#: Every restricted Catalog call used to re-read `information_schema` for every dataset in the
#: model (a fresh connection each, ~13 ms), which dominated query latency. Names change on a
#: DDL timescale, not a query timescale.
#:
#: Staleness is fail-closed in both directions: a column added inside the window is reported
#: unknown (the policy is refused, not silently skipped), and one dropped inside it produces a
#: source error on the generated SQL. Neither widens what a caller can see.
COLUMN_CACHE_TTL_SECONDS = 300.0
_column_cache: dict[tuple[str, str, str], tuple[float, tuple[str, ...]]] = {}


def invalidate_columns(*, data_source_id: str | None = None, schema_name: str | None = None,
                       table_name: str | None = None) -> None:
    """Drop cached names. Called when a dataset's physical identity changes."""
    for key in list(_column_cache):
        source, schema, table = key
        if data_source_id is not None and source != data_source_id:
            continue
        if schema_name is not None and schema != schema_name:
            continue
        if table_name is not None and table != table_name:
            continue
        _column_cache.pop(key, None)


def cached_column_names(
    ds: DataSource, schema_name: str, table_name: str
) -> tuple[str, ...]:
    """Column names for one table, from cache when fresh. **Blocking** on a miss."""
    key = (ds.id, schema_name, table_name)
    now = time.monotonic()
    hit = _column_cache.get(key)
    if hit is not None and now - hit[0] < COLUMN_CACHE_TTL_SECONDS:
        return hit[1]
    rows = fetch_columns_sync(ds, schema_name, table_name)
    names = tuple(str(row[0]) for row in rows)
    _column_cache[key] = (now, names)
    return names


def fetch_columns_sync(ds: DataSource, schema_name: str, table_name: str) -> list[Any]:
    """Read one table's `information_schema` rows. **Blocking** — call it off the event loop.

    Each call opens a fresh connection (``NullPool``, ~13 ms measured against a local
    PostgreSQL) and disposes the engine, so this is connection setup, not query cost. Running it
    inline in a coroutine blocks every other request for that long, which is why the callers
    below wrap it in ``asyncio.to_thread``.
    """
    engine = pg_engine_for_datasource(ds)
    try:
        with engine.connect() as conn:
            return conn.execute(_COLUMN_SQL, {"s": schema_name, "t": table_name}).fetchall()
    finally:
        engine.dispose()


async def pg_columns(db: AsyncSession, dataset: Dataset) -> list[dict[str, Any]]:
    """Live column metadata (name, ontology type, nullable, ordinal) from information_schema."""
    ds = await db.get(DataSource, dataset.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise ColumnError("Columns are only supported for PostgreSQL datasets.")
    if not is_valid_identifier(dataset.schema_name) or not is_valid_identifier(dataset.table_name):
        raise ColumnError("Invalid dataset table.")
    rows = await asyncio.to_thread(
        fetch_columns_sync, ds, dataset.schema_name, dataset.table_name
    )
    out: list[dict[str, Any]] = []
    for r in rows:
        source_type = normalize_postgresql_column_type(str(r[1]), str(r[2] or ""))
        out.append(
            {
                "column_name": str(r[0]),
                "data_type": source_type,
                "ontology_type": str(map_source_type_to_ontology(ds.kind, source_type)),
                "is_nullable": r[3] == "YES",
                "ordinal": int(r[4] or 0),
            }
        )
    return out


async def description_map(db: AsyncSession, dataset_id: str) -> dict[str, str]:
    """column_name → description (only the ones with a stored description)."""
    rows = (
        await db.execute(select(DatasetColumn).where(DatasetColumn.dataset_id == dataset_id))
    ).scalars().all()
    return {r.column_name: r.description for r in rows if r.description}


async def set_description(
    db: AsyncSession,
    dataset: Dataset,
    column_name: str,
    description: str | None,
    *,
    sub: str | None = None,
    uname: str | None = None,
) -> None:
    if not is_valid_identifier(column_name):
        raise ColumnError("Invalid column name.")
    if column_name not in {c["column_name"] for c in await pg_columns(db, dataset)}:
        raise ColumnError(f"Column '{column_name}' not found.")
    row = (
        await db.execute(
            select(DatasetColumn).where(
                DatasetColumn.dataset_id == dataset.id,
                DatasetColumn.column_name == column_name,
            )
        )
    ).scalars().first()
    if row:
        row.description = description
    else:
        db.add(
            DatasetColumn(
                id=str(uuid.uuid4()),
                dataset_id=dataset.id,
                column_name=column_name,
                description=description,
                created_by=sub,
                created_by_name=uname,
            )
        )
    await db.commit()
