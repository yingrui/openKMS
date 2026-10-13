"""Compute a metric by injecting an Ossie SQL expression into a generated query.

A metric is a model-level **SQL fragment** (Ossie ``expression.dialects``) anchored on
a base dataset and traversing registered relationships. The SQL is assembled here —
base table + relationship joins + filters — and the fragment is injected as the metric
value. No custom DSL. ``build_metric_sql`` is pure (no DB) and unit-tested.

Executions run **read-only** with a **statement timeout** and a **row cap**; the
data-source credential is the privilege boundary.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.models.dataset_join import DatasetJoin
from app.models.metric_definition import MetricDefinition
from app.services.ontology.dataset_tables import is_valid_identifier, pg_engine_for_datasource
from app.services.ontology.property_types import serialize_cell_value

ANSI = "ANSI_SQL"
METRIC_TYPES = ("simple", "ratio", "derived", "cumulative", "conversion")
DEFAULT_ROW_CAP = 1000
DEFAULT_TIMEOUT_MS = 10_000

_OP_MAP = {"=": "=", "!=": "<>", ">": ">", ">=": ">=", "<": "<", "<=": "<=", "like": "LIKE"}
VALID_OPS = tuple(_OP_MAP) + ("in", "not_in", "is_null", "is_not_null")


class MetricError(ValueError):
    """Raised when a metric cannot be computed; surfaced as HTTP 400."""


def metric_expression_sql(expression: dict | None) -> str | None:
    """The ANSI_SQL fragment of an Ossie expression, if any."""
    if not isinstance(expression, dict):
        return None
    dialects = expression.get("dialects")
    if not isinstance(dialects, dict):
        return None
    value = dialects.get(ANSI)
    return value if isinstance(value, str) else None


def validate_metric_definition(*, name: str | None, type: str, expression: dict | None) -> str:
    """Validate a metric definition and return its expression fragment."""
    if not (name or "").strip():
        raise MetricError("A metric needs a name.")
    if type not in METRIC_TYPES:
        raise MetricError(f"type must be one of: {', '.join(METRIC_TYPES)}.")
    sql = metric_expression_sql(expression)
    if not sql or not sql.strip():
        raise MetricError("The metric needs an expression (its aggregate SQL fragment).")
    if any(tok in sql for tok in (";", "--", "/*", "*/")):
        raise MetricError("The expression must be a single SQL fragment (no ';' or comments).")
    return sql


def build_metric_sql(
    base_dataset: Dataset,
    metric: MetricDefinition,
    *,
    joins_by_id: dict[str, DatasetJoin],
    datasets_by_id: dict[str, Dataset],
    row_cap: int = DEFAULT_ROW_CAP,
) -> tuple[str, dict[str, Any]]:
    """Build ``(sql, params)`` for a metric. Raises :class:`MetricError` on invalid input."""
    expr = validate_metric_definition(
        name=metric.name, type=metric.type, expression=metric.expression
    )
    if not (
        is_valid_identifier(base_dataset.schema_name) and is_valid_identifier(base_dataset.table_name)
    ):
        raise MetricError("Invalid dataset table.")

    joins_sql: list[str] = []
    for i, join_id in enumerate(metric.joins or []):
        join = joins_by_id.get(join_id)
        if not join:
            raise MetricError(f"Relationship '{join_id}' not found.")
        if join.from_dataset_id == base_dataset.id:
            other_id, metric_is_from = join.to_dataset_id, True
        elif join.to_dataset_id == base_dataset.id:
            other_id, metric_is_from = join.from_dataset_id, False
        else:
            raise MetricError(f"Relationship '{join_id}' does not touch the base dataset.")
        other = datasets_by_id.get(other_id)
        if not other:
            raise MetricError("Joined dataset not found.")
        if not (is_valid_identifier(other.schema_name) and is_valid_identifier(other.table_name)):
            raise MetricError("Invalid joined table.")
        alias = f"j{i}"
        from_cols = list(join.from_columns or [])
        to_cols = list(join.to_columns or [])
        if len(from_cols) != len(to_cols) or not from_cols:
            raise MetricError("Relationship columns are not aligned.")
        ons: list[str] = []
        for s, t in zip(from_cols, to_cols):
            if not (
                isinstance(s, str)
                and isinstance(t, str)
                and is_valid_identifier(s)
                and is_valid_identifier(t)
            ):
                raise MetricError("Invalid relationship column.")
            ons.append(
                f'base."{s}" = {alias}."{t}"' if metric_is_from else f'base."{t}" = {alias}."{s}"'
            )
        join_kind = (join.join_type or "left").upper()
        if join_kind not in ("LEFT", "INNER", "RIGHT", "FULL"):
            join_kind = "LEFT"
        joins_sql.append(
            f'{join_kind} JOIN "{other.schema_name}"."{other.table_name}" {alias} ON '
            + " AND ".join(ons)
        )

    params: dict[str, Any] = {}
    where: list[str] = []
    for i, f in enumerate(metric.filters or []):
        c, op, val = f.get("column"), f.get("op"), f.get("value")
        if not (isinstance(c, str) and is_valid_identifier(c)):
            raise MetricError("Invalid filter column.")
        if op not in VALID_OPS:
            raise MetricError(f"Unsupported operator '{op}'.")
        qcol = f'base."{c}"'
        if op == "is_null":
            where.append(f"{qcol} IS NULL")
        elif op == "is_not_null":
            where.append(f"{qcol} IS NOT NULL")
        elif op in ("in", "not_in"):
            if not isinstance(val, list):
                raise MetricError("IN filter value must be a list.")
            keys: list[str] = []
            for j, v in enumerate(val):
                k = f"f{i}_{j}"
                params[k] = v
                keys.append(f":{k}")
            where.append(f"{qcol} {'IN' if op == 'in' else 'NOT IN'} ({', '.join(keys)})")
        else:
            k = f"f{i}"
            params[k] = val
            where.append(f"{qcol} {_OP_MAP[op]} :{k}")

    sql = (
        f'SELECT {expr} AS value FROM "{base_dataset.schema_name}"."{base_dataset.table_name}" base'
    )
    if joins_sql:
        sql += " " + " ".join(joins_sql)
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += f" LIMIT {int(row_cap)}"
    return sql, params


async def _resolve_joins(
    db: AsyncSession, base_dataset: Dataset, metric: MetricDefinition
) -> tuple[dict[str, DatasetJoin], dict[str, Dataset]]:
    joins_by_id: dict[str, DatasetJoin] = {}
    datasets_by_id: dict[str, Dataset] = {}
    for join_id in metric.joins or []:
        join = await db.get(DatasetJoin, join_id)
        if not join:
            raise MetricError(f"Relationship '{join_id}' not found.")
        joins_by_id[join_id] = join
        if base_dataset.id not in (join.from_dataset_id, join.to_dataset_id):
            raise MetricError(f"Relationship '{join_id}' does not touch the base dataset.")
        other_id = (
            join.to_dataset_id
            if join.from_dataset_id == base_dataset.id
            else join.from_dataset_id
        )
        if other_id not in datasets_by_id:
            other = await db.get(Dataset, other_id)
            if not other:
                raise MetricError("Joined dataset not found.")
            datasets_by_id[other_id] = other
    return joins_by_id, datasets_by_id


async def compute_metric(
    db: AsyncSession,
    metric: MetricDefinition,
    *,
    row_cap: int = DEFAULT_ROW_CAP,
    timeout_ms: int = DEFAULT_TIMEOUT_MS,
) -> list[dict[str, Any]]:
    """Run a metric read-only (timeout + row cap) and return its rows."""
    base = await db.get(Dataset, metric.base_dataset_id)
    if not base:
        raise MetricError("Base dataset not found.")
    ds = await db.get(DataSource, base.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise MetricError("Metrics only run on PostgreSQL datasets.")

    joins_by_id, datasets_by_id = await _resolve_joins(db, base, metric)
    sql, params = build_metric_sql(
        base, metric, joins_by_id=joins_by_id, datasets_by_id=datasets_by_id, row_cap=row_cap
    )

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
                dict(zip(keys, [serialize_cell_value(v) for v in row]))
                for row in result.fetchall()
            ]
            tx.rollback()
        finally:
            conn.close()
    except MetricError:
        raise
    except Exception as exc:  # noqa: BLE001 - surface any DB error as a metric error
        raise MetricError(f"Metric query failed: {exc}") from exc
    finally:
        engine.dispose()
    return rows
