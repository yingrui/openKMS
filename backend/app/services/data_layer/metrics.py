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

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.models.dataset_join import DatasetJoin
from app.models.metric_definition import MetricDefinition
from app.services.data_layer.sql_build import SqlBuildError, build_joins_sql, build_where
from app.services.data_layer.sql_runner import run_readonly
from app.services.ontology.dataset_tables import is_valid_identifier

ANSI = "ANSI_SQL"
METRIC_TYPES = ("simple", "ratio", "derived", "cumulative", "conversion")
DEFAULT_ROW_CAP = 1000
DEFAULT_TIMEOUT_MS = 10_000


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

    try:
        joins_sql = build_joins_sql(
            base_dataset,
            list(metric.joins or []),
            joins_by_id=joins_by_id,
            datasets_by_id=datasets_by_id,
        )
        where, params = build_where(metric.filters)
    except SqlBuildError as exc:
        raise MetricError(str(exc)) from exc

    sql = (
        f'SELECT {expr} AS value FROM "{base_dataset.schema_name}"."{base_dataset.table_name}" base'
    )
    if joins_sql:
        sql += " " + " ".join(joins_sql)
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += f" LIMIT {int(row_cap)}"
    return sql, params


async def resolve_joins(
    db: AsyncSession, base_dataset: Dataset, join_ids: list[str] | None
) -> tuple[dict[str, DatasetJoin], dict[str, Dataset]]:
    joins_by_id: dict[str, DatasetJoin] = {}
    datasets_by_id: dict[str, Dataset] = {}
    for join_id in join_ids or []:
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

    joins_by_id, datasets_by_id = await resolve_joins(db, base, metric.joins)
    sql, params = build_metric_sql(
        base, metric, joins_by_id=joins_by_id, datasets_by_id=datasets_by_id, row_cap=row_cap
    )

    try:
        return run_readonly(ds, sql, params, timeout_ms=timeout_ms)
    except Exception as exc:  # noqa: BLE001 - surface any DB error as a metric error
        raise MetricError(f"Metric query failed: {exc}") from exc
