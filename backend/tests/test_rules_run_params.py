"""Run parameters are the rule's decision; the period value stays a run argument."""
import asyncio

import pytest
from fastapi import HTTPException

from app.api.rules import _validate_metric_refs
from app.services.ontology.rules.evaluator import _finish
from app.services.ontology.rules.run_params import (
    declared_arguments,
    period_argument,
    period_value,
    run_filters,
    scope_filter,
)


class _EmptySession:
    async def get(self, _model, _key):
        return None


def test_an_operand_naming_an_unknown_metric_is_a_400():
    """A name instead of an id used to reach the reference table and fail as a foreign-key 500."""
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            _validate_metric_refs(
                _EmptySession(),
                {"left": {"metric": "no-such-metric"}, "op": ">", "right": {"value": 0}},
                None,
            )
        )
    assert exc.value.status_code == 400
    assert "unknown metric" in exc.value.detail


def test_run_params_survive_the_payload_json_encoding():
    """`MetricRule.payload` keeps nested documents as JSON strings; the evaluator must decode, not guess."""
    from app.services.ontology.rules.evaluator import _json_field

    payload = {"run_params": '{"arguments": [{"key": "cycle", "kind": "filter", "role": "period"}]}'}
    config = _json_field(payload.get("run_params")) or {}
    assert config["arguments"][0]["role"] == "period"


def test_a_rule_may_declare_no_arguments_at_all():
    """A rule that says nothing takes nothing — no period is injected behind the author's back."""
    assert declared_arguments({"run_params": None}) == []
    assert period_argument({"run_params": None}) is None
    assert period_value({"run_params": None}, {}) == ("", "")


def test_the_period_is_one_of_the_filters_marked_with_a_role():
    payload = {
        "run_params": (
            '{"arguments": ['
            '{"key": "cycle", "kind": "filter", "field": "cycle", "role": "period"},'
            '{"key": "channel", "kind": "filter", "field": "channel"},'
            '{"key": "scenario", "kind": "key", "field": "scenario_id"}]}'
        )
    }
    assert [a["key"] for a in declared_arguments(payload)] == ["cycle", "channel", "scenario"]
    assert period_argument(payload)["field"] == "cycle"
    # The period argument is compiled by the calendar, not as a plain equality on the label.
    assert [f["field"] for f in run_filters(payload, {"cycle": "2026-W46", "channel": "x"})[0]] == [
        "channel"
    ]


def test_filter_values_become_operand_filters_and_are_optional():
    payload = {
        "run_params": '{"arguments": [{"key": "channel", "kind": "filter", "field": "channel"}]}'
    }
    assert run_filters(payload, {"channel": "线上"}) == (
        [{"field": "channel", "op": "=", "value": "线上"}],
        "",
    )
    # Declaring a parameter says the rule *can* take a slice; it does not demand one.
    assert run_filters(payload, {}) == ([], "")
    assert run_filters(payload, {"channel": "  "}) == ([], "")


def test_a_required_argument_without_a_value_stops_the_run():
    payload = {
        "run_params": (
            '{"arguments": [{"key": "channel", "kind": "filter", "field": "channel", "required": true}]}'
        )
    }
    assert run_filters(payload, {}) == ([], "run parameter 'channel' is required")


def test_the_period_argument_is_required_and_says_what_it_is_for():
    payload = {
        "run_params": '{"arguments": [{"key": "cycle", "kind": "filter", "role": "period"}]}'
    }
    assert period_value(payload, {}) == ("", "run parameter 'cycle' is required — it names the period")
    assert period_value(payload, {"cycle": " 2026-W46 "}) == ("2026-W46", "")


def test_key_values_narrow_the_scopes_and_accept_a_comma_list():
    payload = {
        "run_params": '{"arguments": [{"key": "scenario", "kind": "key", "field": "scenario_id"}]}'
    }
    assert scope_filter(payload, {"scenario": ["S1", "S2"]}) == (["S1", "S2"], "")
    assert scope_filter(payload, {"scenario": "S1, S2"}) == (["S1", "S2"], "")
    assert scope_filter(payload, {}) == (None, "")


def test_a_run_that_evaluated_nothing_is_unknown_not_pass():
    """A filter that matched no rows leaves no group to judge — "pass" there would be a lie."""
    from types import SimpleNamespace

    rule = SimpleNamespace(id="rule", version=1, apply_payload=lambda data: None)
    results = asyncio.run(
        _finish(
            None,
            None,
            rule=rule,
            rule_data={},
            grouped=[],
            reasons=["metric m returned no rows"],
            group=None,
            group_field=None,
            period=None,
            dry_run=True,
        )
    )
    assert [r.status for r in results] == ["unknown"]
    assert results[0].reason == "metric m returned no rows"


class _FieldSession:
    """A session whose model has one field (`scenario_id`) and nothing else."""

    def __init__(self, metric):
        self.metric = metric

    async def get(self, _model, _key):
        return self.metric

    async def execute(self, _query):
        return _Rows([])


class _Rows:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None


def test_a_filter_on_an_unregistered_column_is_a_400():
    """A filter naming a column that is not a model field is refused at save time, not at run time."""
    from app.api.rules import RuleArgument, RuleRunParams, _validate_run_params
    from app.models.metric_definition import MetricDefinition

    metric = MetricDefinition(id="m", semantic_model_id="model", base_dataset_id="ds", name="m",
                              additivity="additive", time_dimension=None)
    params = RuleRunParams(
        arguments=[RuleArgument(key="cycle", kind="filter", field="cycle")]
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(_validate_run_params(_FieldSession(metric), "m", params, None))
    assert exc.value.status_code == 400
    assert "cycle" in exc.value.detail
