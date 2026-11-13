"""Rule conditions: the pure part of the Rules app.

The evaluator needs a database and a request (metric engine, dataset summaries), so what is tested
here is the part that must be right before any query runs: validation, operand collection, and the
three-valued comparison (true / false / undecidable).
"""

from __future__ import annotations

import pytest

from app.services.ontology.rules.conditions import (
    ConditionError,
    evaluate_groups,
    collect_datasets,
    collect_metrics,
    evaluate_condition,
    flatten_operands,
    operand_key,
    validate_condition,
)

METRIC_A = {"metric": "m-a"}
METRIC_B = {"metric": "m-b"}
COUNT = {"dataset_agg": {"dataset_id": "ds-1", "fn": "count"}}


def test_validates_single_comparison():
    validate_condition({"left": METRIC_A, "op": ">", "right": {"value": 1}})


def test_rejects_unknown_operator():
    with pytest.raises(ConditionError):
        validate_condition({"left": METRIC_A, "op": "~", "right": {"value": 1}})


def test_rejects_missing_right_value():
    with pytest.raises(ConditionError):
        validate_condition({"left": METRIC_A, "op": ">", "right": {"metric": "m-b"}})


def test_rejects_unknown_operand_kind():
    with pytest.raises(ConditionError):
        validate_condition({"left": {"sql": "select 1"}, "op": ">", "right": {"value": 1}})


def test_dataset_agg_requires_column_unless_count():
    validate_condition({"left": COUNT, "op": ">", "right": {"value": 0}})
    with pytest.raises(ConditionError):
        validate_condition(
            {"left": {"dataset_agg": {"dataset_id": "ds", "fn": "sum"}}, "op": ">", "right": {"value": 0}}
        )


def test_collects_metrics_and_datasets_through_nesting():
    condition = {
        "all": [
            {"left": {"ratio": [METRIC_A, COUNT]}, "op": ">", "right": {"value": 1}},
            {"left": {"diff": [METRIC_A, METRIC_B]}, "op": "==", "right": {"value": 0}},
        ]
    }
    assert collect_metrics(condition) == ["m-a", "m-b"]
    assert collect_datasets(condition) == ["ds-1"]


def test_flatten_operands_is_deduplicated_and_in_first_seen_order():
    condition = {
        "all": [
            {"left": {"diff": [METRIC_A, METRIC_B]}, "op": ">", "right": {"value": 0}},
            {"left": METRIC_A, "op": ">", "right": {"value": 1}},
        ]
    }
    keys = [operand_key(operand) for operand in flatten_operands(condition)]
    assert keys == [operand_key({"diff": [METRIC_A, METRIC_B]}), operand_key(METRIC_A), operand_key(METRIC_B)]


def test_evaluates_all_and_any():
    condition = {
        "all": [
            {"left": METRIC_A, "op": ">", "right": {"value": 1}},
            {"left": METRIC_B, "op": "<", "right": {"value": 5}},
        ]
    }
    resolved = {operand_key(METRIC_A): 2.0, operand_key(METRIC_B): 9.0}
    assert evaluate_condition(condition, resolved) is False
    resolved[operand_key(METRIC_B)] = 4.0
    assert evaluate_condition(condition, resolved) is True

    either = {"any": condition["all"]}
    assert evaluate_condition(either, {operand_key(METRIC_A): 2.0, operand_key(METRIC_B): 9.0}) is True


def test_undecidable_operand_makes_the_whole_condition_unknown():
    condition = {"left": METRIC_A, "op": ">", "right": {"value": 1}}
    assert evaluate_condition(condition, {operand_key(METRIC_A): None}) is None


def test_groups_are_unioned_and_a_missing_operand_makes_the_group_undecidable():
    condition = {
        "all": [
            {"left": METRIC_A, "op": ">", "right": {"value": 1}},
            {"left": METRIC_B, "op": ">", "right": {"value": 0}},
        ]
    }
    resolved = {
        operand_key(METRIC_A): {"s1": 2.0, "s2": 0.5, "s3": 3.0},
        operand_key(METRIC_B): {"s1": 1.0, "s2": 1.0},  # s3 missing here
    }
    grouped = {group: (hit, values) for group, hit, values in evaluate_groups(condition, resolved, "scenario_id")}
    assert set(grouped) == {"s1", "s2", "s3"}
    assert grouped["s1"][0] is True
    assert grouped["s2"][0] is False
    assert grouped["s3"][0] is None  # undecidable, not "pass"


def test_a_rule_without_a_group_evaluates_once():
    condition = {"left": METRIC_A, "op": ">", "right": {"value": 1}}
    grouped = evaluate_groups(condition, {operand_key(METRIC_A): 2.0}, None)
    assert len(grouped) == 1
    assert grouped[0][0] is None
    assert grouped[0][1] is True


def test_group_evaluation_keeps_operands_per_group():
    condition = {
        "left": {"ratio": [METRIC_A, METRIC_B]},
        "op": ">",
        "right": {"value": 1},
    }
    resolved = {
        operand_key({"ratio": [METRIC_A, METRIC_B]}): {"s1": 1.5, "s2": 0.5},
    }
    grouped = {group: hit for group, hit, _ in evaluate_groups(condition, resolved, "scenario_id")}
    assert grouped == {"s1": True, "s2": False}


def test_operator_semantics():
    for op, expected in (
        ("<", True),
        ("<=", True),
        (">", False),
        (">=", False),
        ("==", False),
        ("!=", True),
    ):
        assert evaluate_condition({"left": METRIC_A, "op": op, "right": {"value": 3}}, {operand_key(METRIC_A): 2.0}) is expected
