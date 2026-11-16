"""A rule may assert several equalities; one verdict per scope decides across all of them."""
import asyncio
from types import SimpleNamespace

import pytest

from app.services.ontology.rules import evaluator


def test_a_scope_fails_when_any_identity_is_violated(monkeypatch):
    captured = {}

    async def fake_finish(_db, _request, *, grouped, **kwargs):
        captured["grouped"] = grouped
        return []

    async def fake_verdicts(_db, _request, *, relation, **_kwargs):
        if relation["target"]["metric"] == "a":
            return {"s1": (False, {"target:a": 1}), "s2": (False, {"target:a": 1})}, ["s1", "s2"], []
        # The second identity is violated in s1 and has nothing to compare in s2.
        return {"s1": (True, {"target:b": 2})}, ["s1"], []

    monkeypatch.setattr(evaluator, "_finish", fake_finish)
    monkeypatch.setattr(evaluator, "_identity_verdicts", fake_verdicts)

    rule = SimpleNamespace(id="rule", version=1, apply_payload=lambda data: None)
    asyncio.run(
        evaluator._evaluate_identities(
            None,
            None,
            rule=rule,
            rule_data={"identities": []},
            identities=[{"target": {"metric": "a"}}, {"target": {"metric": "b"}}],
            period=None,
            dry_run=True,
        )
    )
    verdicts = {str(key): violated for key, violated, _values in captured["grouped"]}
    # s1 is violated by the second identity; s2 could not be judged for it.
    assert verdicts == {"s1": True, "s2": None}
    merged = {str(key): values for key, _hit, values in captured["grouped"]}
    assert merged["s1"] == {"target:a": 1, "target:b": 2}


def test_an_identity_that_cannot_be_computed_makes_the_scope_undecidable(monkeypatch):
    """A rule of two identities must not report "holds" when only one of them could be computed."""

    values = {"a": {"s1": 10}, "b": {"s1": 10}, "c": {"s1": 10}, "d": None}

    async def fake_resolve(_db, _request, operand, group_field=None, _period=None, _rp=None, _filters=None):
        return values[operand["metric"]], ""

    monkeypatch.setattr(evaluator, "_resolve_operand", fake_resolve)
    rule = SimpleNamespace(id="rule", version=1, apply_payload=lambda data: None)
    results = asyncio.run(
        evaluator._evaluate_identities(
            None,
            None,
            rule=rule,
            rule_data={"group_by": '{"field": "scenario_id"}'},
            identities=[
                {"target": {"metric": "a"}, "members": [{"metric": "b"}], "tolerance": {"abs": 0}},
                {"target": {"metric": "c"}, "members": [{"metric": "d"}], "tolerance": {"abs": 0}},
            ],
            period=None,
            dry_run=True,
        )
    )
    assert [r.status for r in results] == ["unknown"]


def test_an_event_says_what_to_do_for_the_identities_that_failed():
    """One incident, one severity — but the fix differs per identity, so the advice is composed."""
    advice = evaluator._event_advice(
        {"suggestion": "重跑该方案"},
        ["核对明细是否被截断", "核对超上限口径", "核对明细是否被截断"],
    )
    assert advice == "重跑该方案；核对明细是否被截断；核对超上限口径"
    assert evaluator._event_advice({"suggestion": ""}, []) == ""
