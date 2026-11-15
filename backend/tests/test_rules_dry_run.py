"""试算 (dry run): the same numbers, nothing published, nothing written back.

The contract that matters is negative — a trial must leave no trace. Asserting the returned values alone
would pass even if alerts were created, so the test watches `_upsert_event`, `_close_open_events` and the
rule row itself.
"""
import asyncio

import pytest

from app.models.metric_rule import MetricRule
from app.services.ontology.rules import evaluator as ev


class _FakeDB:
    def __init__(self) -> None:
        self.flushed = 0

    async def flush(self) -> None:
        self.flushed += 1


def _rule() -> MetricRule:
    return MetricRule(
        id="rule-1",
        slug="allocation-overcheck",
        name="分货额度错配",
        metric_id="m-alloc",
        severity="P1",
        conclusion="",
        suggestion="把超配部分转给低于下限的渠道",
        status="active",
        version=1,
        condition={"left": {"metric": "m-alloc"}, "op": ">", "right": {"value": 1}},
        group_by={"field": "scenario_id"},
    )


@pytest.mark.parametrize("dry_run", [True, False])
def test_trial_publishes_nothing_and_leaves_the_rule_alone(monkeypatch, dry_run):
    published: list[str] = []
    closed: list[dict] = []

    async def fake_resolve(_db, _request, operand, group_field=None):
        # Two scenarios, both over the threshold: a real run would open one alert per group.
        return {"s1": 1.4, "s2": 1.2}, ""

    async def fake_upsert(_db, *, rule, rule_data, scope, group, period_start, period_end,
                          period_label, values):
        published.append(scope)
        return f"event-{scope}"

    async def fake_close(_db, *, rule, scopes, period_start, period_end):
        closed.append({"rule": rule, "scopes": list(scopes)})
        return 0

    monkeypatch.setattr(ev, "_resolve_operand", fake_resolve)
    monkeypatch.setattr(ev, "_upsert_event", fake_upsert)
    monkeypatch.setattr(ev, "_close_open_events", fake_close)

    rule = _rule()
    before = (rule.last_status, rule.last_run_at)
    db = _FakeDB()
    results = asyncio.run(
        ev.evaluate_rule(db, request=None, rule=rule, period_start="2026-W46",
                         period_end="2026-W46", period_label="2026-W46", dry_run=dry_run)
    )

    assert [r.status for r in results] == ["fail", "fail"]
    assert [r.group["value"] for r in results] == ["s1", "s2"]
    # Per group, the operand key carries that group's number.
    assert [list(r.values.values()) for r in results] == [[1.4], [1.2]]

    if dry_run:
        assert published == []
        assert closed == []
        assert (rule.last_status, rule.last_run_at) == before, "a trial must not write last_* back"
        assert db.flushed == 0
        assert all(r.would_publish for r in results), "the trial says what it would have done"
        assert all(r.event_id is None for r in results)
    else:
        assert published == ["s1", "s2"]
        assert closed and closed[0]["scopes"] == ["s1", "s2"]
        assert rule.last_status == "fail"
        assert rule.last_period_start == "2026-W46"


@pytest.mark.parametrize("value,expected", [(1.0, [[]]), (None, [])])
def test_an_ungrouped_run_closes_its_alert_only_when_it_decided(monkeypatch, value, expected):
    """A passing run must retire the alert; a run where nothing was computable must not."""
    closed: list[list[str]] = []

    async def fake_resolve(_db, _request, operand, group_field=None):
        return value, "" if value is None else ""

    async def fake_close(_db, *, rule, scopes, period_start, period_end):
        closed.append(list(scopes))
        return 1

    monkeypatch.setattr(ev, "_resolve_operand", fake_resolve)
    monkeypatch.setattr(ev, "_close_open_events", fake_close)

    rule = MetricRule(
        id="rule-2",
        slug="ungrouped",
        name="ungrouped",
        metric_id="m",
        severity="P1",
        conclusion="",
        suggestion="",
        status="active",
        version=1,
        condition={"left": {"metric": "m"}, "op": ">", "right": {"value": 5}},
    )
    results = asyncio.run(ev.evaluate_rule(_FakeDB(), request=None, rule=rule))

    assert results[0].status == ("unknown" if value is None else "pass")
    # A pass closes with no scopes to spare; an undecidable run closes nothing at all.
    assert closed == expected
