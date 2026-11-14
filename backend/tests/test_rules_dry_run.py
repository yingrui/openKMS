"""试算 (dry run): the same numbers, nothing published, nothing written back.

The contract that matters is negative — a trial must leave no trace. Asserting the returned values alone
would pass even if events were created, so the test watches `_upsert_event`, `_close_open_events` and the
rule instance itself.
"""
import asyncio

import pytest

from app.models.object_instance import ObjectInstance
from app.services.ontology.rules import evaluator as ev


class _FakeDB:
    def __init__(self) -> None:
        self.flushed = 0

    async def flush(self) -> None:
        self.flushed += 1


def _rule() -> ObjectInstance:
    return ObjectInstance(
        id="rule-1",
        object_type_id="type-rule",
        data={
            "rule_id": "allocation-overcheck",
            "name": "分货额度错配",
            "severity": "P1",
            "suggestion": "把超配部分转给低于下限的渠道",
            "condition": {"left": {"metric": "alloc-ratio"}, "op": ">", "right": {"value": 1}},
            "group_by": {"field": "scenario_id", "label": "方案"},
        },
    )


@pytest.mark.parametrize("dry_run", [True, False])
def test_trial_publishes_nothing_and_leaves_the_rule_alone(monkeypatch, dry_run):
    published: list[str] = []
    closed: list[dict] = []

    async def fake_builtin_types(_db):
        return object(), object()

    async def fake_resolve(_db, _request, operand, group_field=None):
        # Two scenarios, both over the threshold: a real run would open one event per group.
        return {"s1": 1.4, "s2": 1.2}, ""

    async def fake_upsert(_db, _request, *, rule, rule_data, event_type, scope, group,
                          period_start, period_end, values):
        published.append(scope)
        return f"event-{scope}"

    async def fake_close(_db, _event_type, *, rule, scopes, period_start, period_end):
        closed.append({"rule": rule, "scopes": list(scopes)})
        return 0

    async def fake_sync(*_a, **_kw):
        return None

    monkeypatch.setattr(ev, "builtin_types", fake_builtin_types)
    monkeypatch.setattr(ev, "_resolve_operand", fake_resolve)
    monkeypatch.setattr(ev, "_upsert_event", fake_upsert)
    monkeypatch.setattr(ev, "_close_open_events", fake_close)
    monkeypatch.setattr(ev, "sync_queue_ids_to_neo4j", fake_sync)

    rule = _rule()
    before = dict(rule.data)
    db = _FakeDB()
    results = asyncio.run(
        ev.evaluate_rule(db, request=None, rule=rule, period_start="2026-W46",
                         period_end="2026-W46", dry_run=dry_run)
    )

    # Both runs report the same verdicts and the same per-group values.
    assert [r.status for r in results] == ["fail", "fail"]
    assert [r.group["value"] for r in results] == ["s1", "s2"]
    # Per group, the operand key carries that group's number — one value per group, not a map per row.
    assert [list(r.values.values()) for r in results] == [[1.4], [1.2]]

    if dry_run:
        assert published == []
        assert closed == []
        assert rule.data == before, "a trial must not write last_* back"
        assert db.flushed == 0
        assert all(r.would_publish for r in results), "the trial says what it would have done"
        assert all(r.event_id is None for r in results)
    else:
        assert published == ["s1", "s2"]
        assert closed and closed[0]["scopes"] == ["s1", "s2"]
        assert rule.data["last_status"] == "fail"
        assert rule.data["last_failed_groups"] == ["s1", "s2"]
