"""Answer votes and the usage numbers built on them.

Two decisions worth pinning, both database-free:

* **a vote is one row per reader per answer** — changing one's mind edits it, pressing the same thumb again
  withdraws it;
* **usage is read from the audit trail**, not from a second call log, so the path it queries has to stay the
  path a caller actually takes.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

import app.services.workforce.usage as usage_module


class _FakeResult:
    def __init__(self, row):
        self._row = row

    def scalars(self):
        return self

    def first(self):
        return self._row


class _FakeDB:
    """Enough of `AsyncSession` to run the feedback handler: one lookup, then add/delete/commit."""

    def __init__(self, existing=None):
        self.existing = existing
        self.added: list[object] = []
        self.deleted: list[object] = []
        self.commits = 0

    async def execute(self, _statement):
        return _FakeResult(self.existing)

    def add(self, obj):
        self.added.append(obj)

    async def delete(self, obj):
        self.deleted.append(obj)

    async def commit(self):
        self.commits += 1

    async def flush(self):
        return None

    async def get(self, _model, _key):
        return None


def _request(sub: str = "user-1", name: str = "张三"):
    request = SimpleNamespace()
    request.state = SimpleNamespace(
        openkms_jwt_payload={"sub": sub, "preferred_username": name},
    )
    return request


@pytest.fixture()
def feedback_module(monkeypatch):
    from app.api import workforce as module

    async def _no_scoping(_db, _request, _agent_id, *, write):
        return SimpleNamespace(id="agent-1")

    monkeypatch.setattr(module, "_scoped", _no_scoping)
    return module


def _vote(module, db, *, vote, message_id="msg-1", conversation_id="conv-1"):
    body = module.WorkforceFeedbackRequest(
        message_id=message_id, conversation_id=conversation_id, vote=vote
    )
    return asyncio.run(
        module.record_feedback(
            agent_id="agent-1", body=body, request=_request(), db=db
        )
    )


class TestAnswerFeedback:
    def test_first_vote_inserts_one_row(self, feedback_module):
        db = _FakeDB(existing=None)
        out = _vote(feedback_module, db, vote="up")
        assert out.vote == "up"
        assert len(db.added) == 1
        row = db.added[0]
        assert (row.agent_id, row.message_id, row.vote, row.actor_sub) == (
            "agent-1",
            "msg-1",
            "up",
            "user-1",
        )
        # The answer itself is not copied: the message row already holds it.
        assert not hasattr(row, "content")

    def test_changing_one_mind_edits_the_same_row(self, feedback_module):
        existing = SimpleNamespace(id="fb-1", vote="up", conversation_id="conv-1", message_id="msg-1")
        db = _FakeDB(existing=existing)
        out = _vote(feedback_module, db, vote="down")
        assert out.vote == "down"
        assert existing.vote == "down"
        # No second row: the unique key is (message_id, actor_sub), so the same reader cannot outvote themselves.
        assert db.added == []

    def test_pressing_the_same_thumb_again_withdraws_the_vote(self, feedback_module):
        existing = SimpleNamespace(id="fb-1", vote="up", conversation_id="conv-1", message_id="msg-1")
        db = _FakeDB(existing=existing)
        out = _vote(feedback_module, db, vote=None)
        assert out.vote is None
        assert db.deleted == [existing]

    def test_withdrawing_a_vote_closes_the_case_it_opened(self, feedback_module):
        existing = SimpleNamespace(id="fb-9", vote="down", conversation_id="conv-1", message_id="msg-1")
        db = _FakeDB(existing=existing)
        closed: list[tuple[str, str]] = []

        async def _close(_db, *, source_ref, kind, resolution):
            closed.append((source_ref, resolution))
            return True

        feedback_module.close_for_source = _close
        out = _vote(feedback_module, db, vote=None)
        assert out.vote is None
        # The queue item is closed *before* the vote row goes: an item queued for a withdrawn verdict sends someone to
        # fix an answer the reader has already accepted.
        assert closed == [("feedback:fb-9", "vote withdrawn")]
        assert db.deleted == [existing]

    def test_withdrawing_a_vote_that_is_not_there_is_not_an_error(self, feedback_module):
        db = _FakeDB(existing=None)
        out = _vote(feedback_module, db, vote=None)
        assert out.vote is None
        assert db.deleted == []

    def test_the_route_rejects_a_vote_that_is_neither_up_nor_down(self, feedback_module):
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            feedback_module.WorkforceFeedbackRequest(message_id="m", vote="meh")


class TestUsageIsReadFromTheAuditTrail:
    def test_the_query_path_is_the_path_a_caller_takes(self):
        # A caller's question lands on the service router; if this drifts, every agent reports zero calls.
        assert usage_module.ask_path("agent-1") == "/api/workforce/agents/agent-1/ask"

    def test_no_agents_means_no_queries(self):
        db = _FakeDB()
        assert asyncio.run(usage_module.usage_by_agent(db, [])) == {}

    def test_an_agent_without_activity_still_answers_with_zeroes(self):
        class _Empty:
            async def execute(self, _statement):
                return SimpleNamespace(all=lambda: [])

        out = asyncio.run(usage_module.usage_by_agent(_Empty(), ["agent-1"]))
        assert out["agent-1"] == {
            "calls_7d": 0,
            "errors_7d": 0,
            "last_call_at": None,
            "upvotes": 0,
            "downvotes": 0,
        }


class TestIssuesQueue:
    """The queue's two rules: one open item per source, and no "resolved" without a sentence."""

    def test_a_resolution_is_required_to_resolve(self):
        from app.models.workforce_issue import ISSUE_RESOLVED, WorkforceIssue
        from app.services.workforce.issues import apply_status

        row = WorkforceIssue(id="i1", agent_id="a1", kind="refusal", source_ref="s", summary="", status="open")
        assert apply_status(row, status=ISSUE_RESOLVED, resolution=None, resolved_by="u") is False
        assert row.status == "open", "a rejected move must not half-apply"
        assert apply_status(row, status=ISSUE_RESOLVED, resolution="repaired the prompt", resolved_by="u")
        assert (row.resolution, row.resolved_by) == ("repaired the prompt", "u")
        assert row.resolved_at is not None

    def test_ignoring_can_carry_a_reason_but_does_not_need_one(self):
        from app.models.workforce_issue import WorkforceIssue
        from app.services.workforce.issues import apply_status

        row = WorkforceIssue(id="i2", agent_id="a1", kind="refusal", source_ref="s", summary="", status="open")
        assert apply_status(row, status="ignored", resolution=None, resolved_by="u")
        assert row.status == "ignored" and row.resolution is None

    def test_an_open_item_is_not_opened_twice_for_one_source(self):
        import asyncio

        import app.services.workforce.issues as issues_module

        class _Existing:
            async def execute(self, _statement):
                return SimpleNamespace(scalars=lambda: SimpleNamespace(first=lambda: "row-id"))

        out = asyncio.run(
            issues_module.open_issue(
                _Existing(),
                agent_id="a1",
                kind="negative_feedback",
                source_ref="feedback:1",
                summary="duplicate",
            )
        )
        assert out is None

    def test_the_summary_is_one_line(self):
        from app.services.workforce.issues import SUMMARY_CHARS, excerpt

        assert len(excerpt("x" * (SUMMARY_CHARS + 50), SUMMARY_CHARS)) == SUMMARY_CHARS + 1
        assert excerpt("  short  ") == "short"

    def test_guardrail_kinds_are_reserved_but_named(self):
        # Guardrails will write these; naming them now means the queue does not grow a section per producer later.
        from app.models.workforce_issue import ISSUE_KINDS

        assert {"violation", "risk", "prompt_injection"} <= set(ISSUE_KINDS)

    def test_refusals_are_queued_unless_the_author_turned_it_off(self):
        from app.api.workforce import _queue_refusals

        assert _queue_refusals(SimpleNamespace(agent_config=None)) is True
        assert _queue_refusals(SimpleNamespace(agent_config={"answer_policy": {}})) is True
        assert _queue_refusals(SimpleNamespace(agent_config={"answer_policy": {"queue_refusals": True}})) is True
        assert _queue_refusals(SimpleNamespace(agent_config={"answer_policy": {"queue_refusals": False}})) is False
