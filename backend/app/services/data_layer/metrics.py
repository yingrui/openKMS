"""Metric definitions: validation, the run limits, and relationship resolution.

A metric is a model-level **SQL fragment** (Ossie ``expression.dialects``) anchored on a
base dataset and traversing registered relationships. The statement itself is assembled
and executed by the single engine in :mod:`app.services.data_layer.query` — a metric
query is a query with no grouping. Executions run read-only with a statement timeout and
a row cap; the data-source credential is the privilege boundary.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dataset import Dataset
from app.models.dataset_join import DatasetJoin
from app.models.metric_definition import MetricDefinition
from app.services.data_layer.expressions import ANSI, dialect_sql

METRIC_TYPES = ("simple", "ratio", "derived", "cumulative", "conversion")
DEFAULT_ROW_CAP = 1000
DEFAULT_TIMEOUT_MS = 10_000


class MetricError(ValueError):
    """Raised when a metric cannot be computed; surfaced as HTTP 400."""


def metric_expression_sql(expression: dict | None) -> str | None:
    """The ANSI_SQL fragment of an Ossie expression, if any."""
    return dialect_sql(expression, ANSI)


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
