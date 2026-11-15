"""The metric graph: structure as a read model, never as a stored edge.

Two things a metric can be related by, and they are different in kind:

* **derived** — the expression names another metric (`{{分货额度}} / NULLIF({{预测需求}}, 0)`). This is
  structure, and it is already written down once, in SQL. No second field to drift.
* **assertion** — a rule declares that the numbers must agree (`分货额度 = 方案累计额度 ±1`). This is a
  claim about the world: it can hold or not, it has a period, a severity and a verdict.

The graph below is **computed** from those two sources on every read. That is deliberate: a stored edge
means a second place to write the same fact, and the first thing to go stale. When metrics become ontology
objects this can be mirrored into a `derived_from` link type; until then the graph is a view, and
`unchecked` is the answer to "which identities does nobody verify?".
"""
from __future__ import annotations

from typing import Any

from app.models.metric_definition import MetricDefinition
from app.services.data.expressions import ANSI, dialect_sql
from app.services.data.metric_refs import metric_references


def _indexes(metrics: list[MetricDefinition]) -> tuple[dict[str, MetricDefinition], dict[str, MetricDefinition]]:
    by_id = {m.id: m for m in metrics}
    by_ref = {}
    for m in metrics:
        by_ref[m.id] = m
        by_ref.setdefault(m.name, m)
    return by_id, by_ref


def _relation_edges(rules: list[dict[str, Any]], by_ref: dict[str, MetricDefinition]) -> list[dict[str, Any]]:
    edges: list[dict[str, Any]] = []
    for rule in rules:
        relation = rule.get("relation")
        if not isinstance(relation, dict):
            continue
        target = (relation.get("target") or {}).get("metric")
        if not target:
            continue
        tolerance = relation.get("tolerance") or {}
        for member in relation.get("members") or []:
            ref = (member or {}).get("metric")
            if not ref:
                continue
            edges.append(
                {
                    "from": str(target),
                    "to": str(ref),
                    "kind": "assertion",
                    "weight": float((member or {}).get("weight") or 1),
                    "tolerance": tolerance or None,
                    "source": "rule",
                    "rule_id": rule.get("rule_id"),
                    "rule_object_id": rule.get("object_id"),
                    "health": rule.get("last_status"),
                }
            )
    return edges


def build_graph(
    metrics: list[MetricDefinition],
    rules: list[dict[str, Any]],
) -> dict[str, Any]:
    """Nodes are this model's metrics; edges come from expressions and from relations, never storage."""
    by_id, by_ref = _indexes(metrics)
    edges: list[dict[str, Any]] = []

    for metric in metrics:
        sql = dialect_sql(metric.expression, ANSI)
        for ref in metric_references(sql):
            component = by_ref.get(ref)
            if component is None or component.id == metric.id:
                continue
            edges.append(
                {
                    "from": metric.id,
                    "to": component.id,
                    "kind": "derived",
                    "weight": 1.0,
                    "tolerance": None,
                    "source": "expression",
                    "rule_id": None,
                    "rule_object_id": None,
                    "health": None,
                }
            )

    assertion_edges = [
        edge
        for edge in _relation_edges(rules, by_ref)
        # Only edges whose two ends are metrics of this model belong to this graph.
        if edge["from"] in by_ref and edge["to"] in by_ref
    ]
    covered = {(edge["from"], edge["to"]) for edge in assertion_edges}
    for edge in edges:
        edge["checked"] = (edge["from"], edge["to"]) in covered
    edges.extend(
        {**edge, "from": by_ref[edge["from"]].id, "to": by_ref[edge["to"]].id, "checked": True}
        for edge in assertion_edges
    )

    nodes = [
        {
            "id": metric.id,
            "name": metric.name,
            "additivity": metric.additivity,
            "base_dataset_id": metric.base_dataset_id,
            "expression": dialect_sql(metric.expression, ANSI),
        }
        for metric in metrics
    ]
    return {
        "nodes": nodes,
        "edges": edges,
        # Counted, not listed: a derived edge needs no rule (see the module docstring), so a list of
        # "unchecked" ones would be a to-do list of tautologies.
        "derived_count": sum(1 for edge in edges if edge["kind"] == "derived"),
        "assertion_count": sum(1 for edge in edges if edge["kind"] == "assertion"),
    }
