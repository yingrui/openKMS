"""Read-only SQL execution for the data layer (metrics + saved queries).

Runs a query in a **read-only transaction** with a **statement timeout**, so a
generated query can never mutate data and cannot run unbounded. The data-source
credential is the privilege boundary.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text

from app.models.data_source import DataSource
from app.services.ontology.dataset_tables import pg_engine_for_datasource
from app.services.ontology.property_types import serialize_cell_value


def run_readonly(
    ds: DataSource,
    sql: str,
    params: dict[str, Any],
    *,
    timeout_ms: int,
) -> list[dict[str, Any]]:
    """Execute ``sql`` read-only and return serialized rows.

    Raises the underlying DB error (callers wrap it in their domain error type).
    """
    engine = pg_engine_for_datasource(ds)
    try:
        conn = engine.connect()
        try:
            tx = conn.begin()
            conn.exec_driver_sql("SET TRANSACTION READ ONLY")
            conn.exec_driver_sql(f"SET LOCAL statement_timeout = {int(timeout_ms)}")
            result = conn.execute(text(sql), params)
            keys = list(result.keys())
            rows = [
                dict(zip(keys, [serialize_cell_value(v) for v in row], strict=True))
                for row in result.fetchall()
            ]
            tx.rollback()
        finally:
            conn.close()
    finally:
        engine.dispose()
    return rows


def run_readonly_scalar(ds: DataSource, sql: str, *, timeout_ms: int) -> tuple[int, list[Any]]:
    """Run ``sql`` read-only and report its **shape** (column count) plus the first row.

    `run_readonly` returns dicts, and a dict collapses duplicate column names — so
    ``SELECT count(*), count(*)`` looked like one column and passed a check that wanted exactly one.
    This is the same envelope (read-only transaction, statement timeout), reported without that loss.
    """
    engine = pg_engine_for_datasource(ds)
    try:
        conn = engine.connect()
        try:
            tx = conn.begin()
            conn.exec_driver_sql("SET TRANSACTION READ ONLY")
            conn.exec_driver_sql(f"SET LOCAL statement_timeout = {int(timeout_ms)}")
            result = conn.execute(text(sql))
            column_count = len(result.keys())
            row = result.fetchone()
            rows = [serialize_cell_value(v) for v in row] if row is not None else []
            tx.rollback()
        finally:
            conn.close()
    finally:
        engine.dispose()
    return column_count, rows
