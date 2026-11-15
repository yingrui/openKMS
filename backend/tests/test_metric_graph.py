"""The metric graph is a view: derived edges come from expressions, assertion edges from rules."""
import pytest

from app.models.metric_definition import MetricDefinition
from app.services.data.metric_graph import assertions_by_metric, build_graph


def _metric(name: str, sql: str, *, additivity: str = "additive") -> MetricDefinition:
    return MetricDefinition(
        id=f"id-{name}",
        semantic_model_id="model",
        base_dataset_id="ds",
        name=name,
        additivity=additivity,
        expression={"dialects": [{"dialect": "ANSI_SQL", "expression": sql}]},
    )


ALLOC = _metric("分货额度", "SUM(allocated_qty)")
DEMAND = _metric("预测需求", "SUM(forecast_qty)")
RATE = _metric("分货满足率", "{{分货额度}} * 1.0 / NULLIF({{预测需求}}, 0)", additivity="non_additive")


def test_derived_edges_are_read_off_the_expression():
    graph = build_graph([ALLOC, DEMAND, RATE], [])
    derived = [edge for edge in graph["edges"] if edge["kind"] == "derived"]
    assert {(edge["from"], edge["to"]) for edge in derived} == {
        (RATE.id, ALLOC.id),
        (RATE.id, DEMAND.id),
    }
    assert all(edge["source"] == "expression" and edge["checked"] is False for edge in derived)
    assert graph["derived_count"] == 2


def test_a_relation_turns_the_edge_into_a_checked_assertion():
    rule = {
        "object_id": "rule-1",
        "rule_id": "allocation-overcheck",
        "last_status": "pass",
        "relation": {
            "target": {"metric": RATE.id},
            "members": [{"metric": ALLOC.id, "weight": 1}, {"metric": DEMAND.id, "weight": -1}],
            "tolerance": {"rel": 0.001},
        },
    }
    graph = build_graph([ALLOC, DEMAND, RATE], [rule])
    derived = [edge for edge in graph["edges"] if edge["kind"] == "derived"]
    assert all(edge["checked"] for edge in derived)
    assert graph["assertion_count"] == 2
    assertion = [edge for edge in graph["edges"] if edge["kind"] == "assertion"]
    assert {(edge["to"], edge["weight"]) for edge in assertion} == {(ALLOC.id, 1.0), (DEMAND.id, -1.0)}
    assert all(edge["rule_id"] == "allocation-overcheck" for edge in assertion)


def test_relations_pointing_outside_the_model_are_ignored():
    outsider = _metric("别处的指标", "SUM(x)")
    rule = {
        "object_id": "r",
        "rule_id": "other",
        "relation": {"target": {"metric": ALLOC.id}, "members": [{"metric": outsider.id}]},
    }
    graph = build_graph([ALLOC, DEMAND], [rule])
    assert [edge for edge in graph["edges"] if edge["kind"] == "assertion"] == []


def test_assertions_are_shaped_for_a_consumer_that_cannot_paint():
    rule = {
        "object_id": "rule-1",
        "rule_id": "allocation-total-reconcile",
        "last_status": "fail",
        "relation": {
            "target": {"metric": ALLOC.id},
            "members": [{"metric": DEMAND.id, "weight": -1}],
            "tolerance": {"abs": 1},
        },
    }
    shaped = assertions_by_metric(build_graph([ALLOC, DEMAND], [rule]))

    target = shaped[ALLOC.id][0]
    assert target["direction"] == "asserts"
    assert target["counterpart"] == DEMAND.id
    assert target["weight"] == -1
    assert target["tolerance"] == {"abs": 1}
    assert target["rule_id"] == "allocation-total-reconcile"
    assert target["health"] == "fail"
    # The other side of the same identity is reported too, so a question about either metric is qualified.
    assert shaped[DEMAND.id][0]["direction"] == "asserted_by"


def test_definitions_are_not_assertions():
    shaped = assertions_by_metric(build_graph([ALLOC, DEMAND, RATE], []))
    assert shaped == {}  # no rules, so no claims — the expressions are not claims
