"""Dataset profile computation + schema snapshot tracking (read-time insights)."""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.models.dataset_profile import DatasetProfile, SchemaSnapshot
from app.services.ontology.dataset_tables import is_valid_identifier, pg_engine_for_datasource
from app.services.ontology.property_types import serialize_cell_value


class ProfileError(ValueError):
    """Raised when a dataset cannot be profiled; surfaced as HTTP 400."""


async def compute_profile(db: AsyncSession, dataset: Dataset) -> tuple[int, list[dict[str, Any]]]:
    """Scan the backing table and return (row_count, per-column stats)."""
    ds = await db.get(DataSource, dataset.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise ProfileError("Profiling is only supported for PostgreSQL datasets.")
    schema, table = dataset.schema_name, dataset.table_name
    if not is_valid_identifier(schema) or not is_valid_identifier(table):
        raise ProfileError("Invalid dataset table.")
    quoted = f'"{schema}"."{table}"'
    stats: list[dict[str, Any]] = []
    engine = pg_engine_for_datasource(ds)
    try:
        with engine.connect() as conn:
            total = int(conn.execute(text(f"SELECT COUNT(*) FROM {quoted}")).scalar() or 0)
            cols = conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema = :s AND table_name = :t ORDER BY ordinal_position"
                ),
                {"s": schema, "t": table},
            ).fetchall()
            for (col,) in cols:
                name = str(col)
                if not is_valid_identifier(name):
                    continue
                entry: dict[str, Any] = {"column": name}
                try:
                    row = conn.execute(
                        text(
                            f'SELECT COUNT("{name}") AS nn, COUNT(DISTINCT "{name}") AS nd, '
                            f'MIN("{name}") AS mn, MAX("{name}") AS mx FROM {quoted}'
                        )
                    ).mappings().first()
                    non_null = int((row or {}).get("nn") or 0)
                    entry.update(
                        {
                            "null_count": total - non_null,
                            "distinct_count": int((row or {}).get("nd") or 0),
                            "min": serialize_cell_value((row or {}).get("mn")),
                            "max": serialize_cell_value((row or {}).get("mx")),
                        }
                    )
                except (SQLAlchemyError, ValueError, TypeError):  # MIN/MAX unsupported for some types
                    entry.update({"null_count": None, "distinct_count": None, "min": None, "max": None})
                stats.append(entry)
        return total, stats
    finally:
        engine.dispose()


async def store_profile(
    db: AsyncSession, dataset: Dataset, row_count: int, column_stats: list[dict[str, Any]]
) -> DatasetProfile:
    row = (
        await db.execute(select(DatasetProfile).where(DatasetProfile.dataset_id == dataset.id))
    ).scalar_one_or_none()
    if row is None:
        row = DatasetProfile(id=str(uuid.uuid4()), dataset_id=dataset.id)
        db.add(row)
    row.row_count = row_count
    row.column_stats = column_stats
    await db.flush()
    return row


async def snapshot_schema_if_changed(
    db: AsyncSession, dataset: Dataset, columns: list[dict[str, Any]]
) -> bool:
    """Append a snapshot if the column names/types differ from the latest. Returns True if appended."""
    latest = (
        await db.execute(
            select(SchemaSnapshot)
            .where(SchemaSnapshot.dataset_id == dataset.id)
            .order_by(SchemaSnapshot.captured_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    signature = [(c.get("column_name"), c.get("data_type")) for c in columns]
    if latest is not None:
        prev = latest.columns or []
        prev_sig = [(c.get("column_name"), c.get("data_type")) for c in prev]
        if prev_sig == signature:
            return False
    db.add(SchemaSnapshot(id=str(uuid.uuid4()), dataset_id=dataset.id, columns=columns))
    await db.flush()
    return True


async def list_schema_history(db: AsyncSession, dataset_id: str) -> list[SchemaSnapshot]:
    result = await db.execute(
        select(SchemaSnapshot)
        .where(SchemaSnapshot.dataset_id == dataset_id)
        .order_by(SchemaSnapshot.captured_at.desc())
    )
    return list(result.scalars().all())
