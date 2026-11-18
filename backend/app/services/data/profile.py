"""Dataset profile computation + schema snapshot tracking (read-time insights)."""
from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime
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


#: Above this many rows, `COUNT(DISTINCT ...)` costs more than the answer is worth for a page display: it is a
#: full sort per column (45 s per column on 66 M rows). The planner's own sample-based estimate is exact enough
#: for reading, and is marked as an estimate so nothing treats it as a uniqueness proof.
EXACT_DISTINCT_MAX_ROWS = 5_000_000

#: Types PostgreSQL cannot compare for equality — `COUNT(DISTINCT json)` raises, and that error aborts the
#: whole statement.
NO_EQUALITY = {"json", "jsonb"}

#: Types with no meaningful order (`MIN(uuid)` is not a function on every server version).
NO_ORDER = {"json", "jsonb", "uuid", "bytea", "point"}


async def compute_profile(db: AsyncSession, dataset: Dataset) -> tuple[int, list[dict[str, Any]]]:
    """Scan the backing table and return (row_count, per-column stats).

    One pass over the table answers everything a scan can answer. The expensive question — how many distinct
    values — is asked of the planner's statistics on large tables, and exactly only where the table is small
    enough for the answer to be worth a sort.
    """
    ds = await db.get(DataSource, dataset.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise ProfileError("Profiling is only supported for PostgreSQL datasets.")
    schema, table = dataset.schema_name, dataset.table_name
    if not is_valid_identifier(schema) or not is_valid_identifier(table):
        raise ProfileError("Invalid dataset table.")
    quoted = f'"{schema}"."{table}"'

    def scan() -> tuple[int, list[dict[str, Any]]]:
        engine = pg_engine_for_datasource(ds)
        try:
            with engine.connect() as conn:
                columns = [
                    (str(name), str(udt or ""))
                    for name, udt in conn.execute(
                        text(
                            "SELECT column_name, udt_name FROM information_schema.columns "
                            "WHERE table_schema = :s AND table_name = :t ORDER BY ordinal_position"
                        ),
                        {"s": schema, "t": table},
                    ).fetchall()
                ]
                columns = [(name, udt) for name, udt in columns if is_valid_identifier(name)]
                total, stats = _scan_one_pass(conn, quoted, columns)
                _add_distinct(conn, quoted, schema, table, columns, total, stats)
                return total, stats
        finally:
            engine.dispose()

    return await asyncio.to_thread(scan)


def _scan_one_pass(conn, quoted: str, columns: list[tuple[str, str]]):
    """Row count, null counts and value ranges in a single statement (one table scan, not one per column)."""
    parts = ["COUNT(*) AS c_total"]
    for i, (name, udt) in enumerate(columns):
        parts.append(f'COUNT("{name}") AS c_nn_{i}')
        if udt.lower() not in NO_ORDER:
            parts.append(f'MIN("{name}") AS c_mn_{i}, MAX("{name}") AS c_mx_{i}')
    try:
        with conn.begin_nested():
            row = dict(conn.execute(text(f"SELECT {', '.join(parts)} FROM {quoted}")).mappings().first() or {})
    except (SQLAlchemyError, ValueError, TypeError):
        # An aggregate this server does not support for some type took the whole statement down: fall back to
        # asking per column, each in its own savepoint, so one unanswerable question stays local.
        row = _scan_per_column(conn, quoted, columns)
    total = int(row.get("c_total") or 0)
    stats: list[dict[str, Any]] = []
    for i, (name, _udt) in enumerate(columns):
        stats.append(
            {
                "column": name,
                "null_count": total - int(row.get(f"c_nn_{i}") or 0),
                "distinct_count": None,
                "min": serialize_cell_value(row.get(f"c_mn_{i}")),
                "max": serialize_cell_value(row.get(f"c_mx_{i}")),
                "distinct_estimated": False,
            }
        )
    return total, stats


def _scan_per_column(conn, quoted: str, columns: list[tuple[str, str]]) -> dict[str, Any]:
    row: dict[str, Any] = {"c_total": 0}
    with conn.begin_nested():
        row["c_total"] = conn.execute(text(f"SELECT COUNT(*) AS n FROM {quoted}")).scalar() or 0
    for i, (name, _udt) in enumerate(columns):
        for sql, keys in (
            (f'SELECT COUNT("{name}") AS nn FROM {quoted}', ("c_nn_",)),
            (f'SELECT MIN("{name}") AS mn, MAX("{name}") AS mx FROM {quoted}', ("c_mn_", "c_mx_")),
        ):
            try:
                with conn.begin_nested():
                    got = dict(conn.execute(text(sql)).mappings().first() or {})
            except (SQLAlchemyError, ValueError, TypeError):
                continue
            for key, value in zip(keys, got.values(), strict=False):
                row[f"{key}{i}"] = value
    return row


def _add_distinct(conn, quoted: str, schema: str, table: str, columns, total: int, stats) -> None:
    """The distinct count: exact on a small table, the planner's estimate on a large one."""
    wanted = [(i, name) for i, (name, udt) in enumerate(columns) if udt.lower() not in NO_EQUALITY]
    if not wanted:
        return
    if total <= EXACT_DISTINCT_MAX_ROWS:
        parts = [f'COUNT(DISTINCT "{name}") AS d_{i}' for i, name in wanted]
        try:
            with conn.begin_nested():
                row = dict(conn.execute(text(f"SELECT {', '.join(parts)} FROM {quoted}")).mappings().first() or {})
        except (SQLAlchemyError, ValueError, TypeError):
            row = {}
        for i, _name in wanted:
            if f"d_{i}" in row:
                stats[i]["distinct_count"] = int(row[f"d_{i}"] or 0)
        return

    # Large table: `pg_stats` already holds a sample-based answer, written by the last ANALYZE.
    try:
        with conn.begin_nested():
            estimates = {
                str(name): value
                for name, value in conn.execute(
                    text(
                        "SELECT attname, n_distinct FROM pg_stats "
                        "WHERE schemaname = :s AND tablename = :t"
                    ),
                    {"s": schema, "t": table},
                ).fetchall()
            }
    except SQLAlchemyError:
        return
    for i, name in wanted:
        value = estimates.get(name)
        if value is None:
            continue
        # A negative `n_distinct` is a fraction of the row count (a column with many distinct values).
        count = abs(float(value)) * total if float(value) < 0 else float(value)
        stats[i]["distinct_count"] = int(round(count))
        stats[i]["distinct_estimated"] = True


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
    # `computed_at` has a server default but no `onupdate`, so a refresh of an existing row kept the first
    # computation's timestamp — the one number that says whether the statistics are current.
    row.computed_at = datetime.now(UTC)
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
