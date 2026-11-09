"""Metric definitions: validation, the run limits, and relationship resolution.

A metric is a model-level **SQL fragment** (Ossie ``expression.dialects``) anchored on a
base dataset and traversing registered relationships. The statement itself is assembled
and executed by the single engine in :mod:`app.services.data.data_layer.query` — a metric
query is a query with no grouping. Executions run read-only with a statement timeout and
a row cap; the data-source credential is the privilege boundary.
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dataset import Dataset
from app.models.dataset_join import DatasetJoin
from app.services.data.data_layer.expressions import ANSI, dialect_sql
from app.services.data.data_layer.sql_build import VALID_OPS
from app.services.ontology.dataset_tables import is_valid_identifier

METRIC_TYPES = ("simple", "ratio", "derived", "cumulative", "conversion")
DEFAULT_ROW_CAP = 1000
DEFAULT_TIMEOUT_MS = 10_000

# A second statement or a nested SELECT would let a fragment invent its own FROM.
_FORBIDDEN_IN_FRAGMENT = (";", "--", "/*", "*/")
_SELECT_TOKEN = re.compile(r"\bSELECT\b", re.IGNORECASE)


class MetricError(ValueError):
    """Raised when a metric cannot be computed; surfaced as HTTP 400."""


def metric_expression_sql(expression: dict | None) -> str | None:
    """The ANSI_SQL fragment of an Ossie expression, if any."""
    return dialect_sql(expression, ANSI)


def validate_sql_fragment(sql: str, *, what: str = "expression") -> str:
    """A single SQL fragment: no second statement, no comments, no nested SELECT."""
    text = (sql or "").strip()
    if not text:
        raise MetricError(f"The {what} must not be empty.")
    if any(tok in text for tok in _FORBIDDEN_IN_FRAGMENT):
        raise MetricError(f"The {what} must be a single SQL fragment (no ';' or comments).")
    if _SELECT_TOKEN.search(text):
        raise MetricError(f"The {what} must not contain a SELECT (no subqueries).")
    return text


def validate_metric_definition(*, name: str | None, type: str, expression: dict | None) -> str:
    """Validate a metric definition and return its expression fragment."""
    if not (name or "").strip():
        raise MetricError("A metric needs a name.")
    if type not in METRIC_TYPES:
        raise MetricError(f"type must be one of: {', '.join(METRIC_TYPES)}.")
    sql = metric_expression_sql(expression)
    if not sql or not sql.strip():
        raise MetricError("The metric needs an expression (its aggregate SQL fragment).")
    return validate_sql_fragment(sql, what="expression")


def validate_metric_filters(filters: list[dict[str, Any]] | list[Any] | None) -> list[dict[str, Any]]:
    """Metric-owned filters are base-table columns; reject bad columns/ops instead of dropping them."""
    if not filters:
        return []
    out: list[dict[str, Any]] = []
    for f in filters:
        raw = f if isinstance(f, dict) else getattr(f, "model_dump", lambda: None)()
        if not isinstance(raw, dict):
            raise MetricError("Each metric filter must be an object.")
        column = raw.get("column")
        op = raw.get("op")
        if not isinstance(column, str) or not is_valid_identifier(column):
            raise MetricError(f"Metric filter column '{column}' is not a valid identifier.")
        if not isinstance(op, str) or op not in VALID_OPS:
            raise MetricError(f"Unsupported metric filter operator '{op}'.")
        out.append({"column": column, "op": op, "value": raw.get("value")})
    return out


async def resolve_joins(
    db: AsyncSession,
    base_dataset: Dataset,
    join_ids: list[str] | None,
    *,
    member_dataset_ids: set[str] | None = None,
) -> tuple[dict[str, DatasetJoin], dict[str, Dataset]]:
    """Load relationships that touch the base; optionally require the other end in the model."""
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
        if member_dataset_ids is not None and other_id not in member_dataset_ids:
            raise MetricError(
                f"Relationship '{join_id}' joins a dataset that is not in this semantic model."
            )
        if other_id not in datasets_by_id:
            other = await db.get(Dataset, other_id)
            if not other:
                raise MetricError("Joined dataset not found.")
            datasets_by_id[other_id] = other
    return joins_by_id, datasets_by_id
