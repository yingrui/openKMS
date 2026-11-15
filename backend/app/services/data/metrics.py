"""Metric definitions: validation, the run limits, and relationship resolution.

A metric is a model-level **SQL fragment** (Ossie ``expression.dialects``) anchored on a
base dataset and traversing registered relationships. The statement itself is assembled
and executed by the single engine in :mod:`app.services.data.query` — a metric
query is a query with no grouping. Executions run read-only with a statement timeout and
a row cap; the data-source credential is the privilege boundary.
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dataset import Dataset
from app.models.dataset_join import DatasetJoin
from app.services.data.expressions import ANSI, dialect_sql
from app.services.data.sql_build import VALID_OPS
from app.services.ontology.dataset_tables import is_valid_identifier

#: Whether the number may be summed over a finer grain. This is the only metric property that
#: changes what a consumer is allowed to do — and the one that prevents summing ratios.
ADDITIVITY = ("additive", "non_additive")
#: `ai_context` keys a consumer (agent, judge, export) can rely on; anything else passes through.
AI_CONTEXT_LISTS = ("synonyms", "examples", "not_for")
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


def validate_metric_definition(
    *, name: str | None, additivity: str, expression: dict | None
) -> str:
    """Validate a metric definition and return its expression fragment."""
    if not (name or "").strip():
        raise MetricError("A metric needs a name.")
    if additivity not in ADDITIVITY:
        raise MetricError(f"additivity must be one of: {', '.join(ADDITIVITY)}.")
    sql = metric_expression_sql(expression)
    if not sql or not sql.strip():
        raise MetricError("The metric needs an expression (its aggregate SQL fragment).")
    fragment = validate_sql_fragment(sql, what="expression")
    validate_additivity(fragment, additivity)
    return fragment


#: An aggregate whose value is a *mean* over rows can be recomputed at a coarser grain but never added:
#: `AVG` over three scenarios is not the average of their averages.
_MEAN_FUNCTIONS = ("AVG", "MEDIAN", "PERCENTILE_CONT", "PERCENTILE_DISC")


def validate_additivity(sql: str, additivity: str) -> None:
    """Reject the one contradiction a machine can see: a mean declared as additive.

    `AVG(wos_after)` per scenario cannot be summed into a total — the engine recomputes it from rows,
    which is correct; a consumer adding the group values is not. This is a lint, not a proof: a mean
    written as `SUM(a) / COUNT(b)` slips through, because reading intent out of SQL is guesswork.
    """
    text = (sql or "").strip()
    outer = text.upper()
    if additivity == "additive" and any(outer.startswith(f) for f in _MEAN_FUNCTIONS):
        raise MetricError(
            "An average cannot be added across groups — mark this metric non_additive "
            "(recompute it at the grain you need instead of summing the parts)."
        )


def validate_ai_context(value: dict[str, Any] | None) -> dict[str, Any] | None:
    """`synonyms` / `examples` / `not_for` are string lists; unknown keys are kept as given."""
    if value is None:
        return None
    if not isinstance(value, dict):
        raise MetricError("ai_context must be an object.")
    out: dict[str, Any] = dict(value)
    instructions = out.get("instructions")
    if instructions is not None and not isinstance(instructions, str):
        raise MetricError("ai_context.instructions must be a string.")
    for key in AI_CONTEXT_LISTS:
        items = out.get(key)
        if items is None:
            continue
        if isinstance(items, str):
            items = [items]
        if not isinstance(items, list) or not all(isinstance(x, str) for x in items):
            raise MetricError(f"ai_context.{key} must be a list of strings.")
        out[key] = [x.strip() for x in items if x.strip()]
    return out


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
