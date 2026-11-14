"""Metric references: a derived metric names the metrics it is computed from.

A metric's expression is an aggregate SQL fragment (Ossie ``expression.dialects``). A derived
metric is not a *kind* of metric — it is a fragment that mentions other metrics:

    "{{分货额度}} / NULLIF({{预测需求}}, 0)"

Expanding the reference inlines the component's own fragment, so ``SUM(allocated_qty) /
NULLIF(SUM(forecast_qty), 0)`` is written once and every consumer gets the same denominator. The
edges are read off the expression; there is no separate dependency field that can drift from the
SQL.

Two constraints keep the expansion honest:

* a component must sit on the **same base dataset** — otherwise the inlined fragment would read a
  table the statement does not join;
* a component's relationships must be a **subset** of the referencing metric's — otherwise the
  inlined fragment would address an alias that is not in the join list.

Both fail as a definition error (400), not as a broken query.
"""
from __future__ import annotations

import re
from typing import TYPE_CHECKING

from app.services.data.expressions import ANSI, dialect_sql

if TYPE_CHECKING:
    from app.models.metric_definition import MetricDefinition

_REF = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")


class MetricRefError(ValueError):
    """A metric reference that cannot be resolved."""


def metric_references(sql: str | None) -> list[str]:
    """The metric names (or ids) a fragment mentions, in order of first appearance."""
    if not sql:
        return []
    seen: list[str] = []
    for name in _REF.findall(sql):
        if name not in seen:
            seen.append(name)
    return seen


def _by_name(metrics: list[MetricDefinition]) -> dict[str, MetricDefinition]:
    index: dict[str, MetricDefinition] = {}
    for m in metrics:
        index[m.id] = m
        index.setdefault(m.name, m)
    return index


def _fragment(metric: MetricDefinition) -> str:
    sql = dialect_sql(metric.expression, ANSI)
    if not isinstance(sql, str) or not sql.strip():
        raise MetricRefError(f"Metric '{metric.name}' has no ANSI_SQL expression.")
    return sql


def expand(
    sql: str,
    metrics: list[MetricDefinition],
    *,
    base_dataset_id: str,
    joins: list[str] | None,
    stack: tuple[str, ...] = (),
) -> tuple[str, list[MetricDefinition]]:
    """Inline every ``{{metric}}`` reference; return the SQL and the components it used."""
    index = _by_name(metrics)
    used: list[MetricDefinition] = []
    joined = set(joins or [])

    def resolve(name: str) -> str:
        component = index.get(name)
        if component is None:
            raise MetricRefError(f"Unknown metric reference '{name}'.")
        if component.id in stack:
            # Name the loop in the author's vocabulary, not in uuids.
            label = {x.id: x.name for x in metrics}
            chain = " → ".join(label.get(i, i) for i in (*stack, component.id))
            raise MetricRefError(f"Circular metric reference: {chain}.")
        if component.base_dataset_id != base_dataset_id:
            raise MetricRefError(
                f"Metric '{component.name}' is defined on another dataset; a reference must stay "
                "on the same base dataset."
            )
        missing = [j for j in (component.joins or []) if j not in joined]
        if missing:
            raise MetricRefError(
                f"Metric '{component.name}' uses {len(missing)} relationship(s) this metric does "
                "not join; add them to the join list."
            )
        inner, inner_used = expand(
            _fragment(component),
            metrics,
            base_dataset_id=base_dataset_id,
            joins=joins,
            stack=(*stack, component.id),
        )
        used.extend([component, *inner_used])
        return f"({inner})"

    expanded = _expand_all(sql, resolve)
    # Keep each component once, in order.
    unique: list[MetricDefinition] = []
    for m in used:
        if all(m.id != seen.id for seen in unique):
            unique.append(m)
    return expanded, unique


def _expand_all(sql: str, resolve) -> str:
    """Replace references, including ones nested inside a component's fragment."""
    previous = None
    current = sql
    # A component's fragment may itself contain references; `resolve` already recurses, so one
    # left-to-right pass per level is enough — the loop is here for references that arrive only
    # after a substitution.
    guard = 0
    while current != previous and guard < 20:
        previous = current
        current = _REF.sub(lambda m: resolve(m.group(1)), current)
        guard += 1
    if guard >= 20:
        raise MetricRefError("Metric references are too deeply nested.")
    return current
