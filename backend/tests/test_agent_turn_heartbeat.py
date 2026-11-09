"""Turn heartbeat: `last_turn.updated_at` must move while a turn makes progress.

The bug this guards: the flush function carried a comment saying the caller refreshes the
heartbeat, but nothing ever did. The timestamp therefore stayed at `started_at`, so every turn
looked stalled three minutes in, and the SPA showed "this turn may be stuck" forever — including
on turns that were streaming normally.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from app.models.agent_models import AgentConversation
from app.services.runtime.deep_agents.observability import AgentTurnContext


def _conversation(status: str = "running") -> AgentConversation:
    started = (datetime.now(timezone.utc) - timedelta(seconds=600)).isoformat()
    return AgentConversation(
        id="c1",
        user_sub="u1",
        surface="project",
        title="t",
        context={
            "last_turn": {
                "turn_id": "old",
                "status": status,
                "started_at": started,
                "updated_at": started,
            }
        },
    )


def _turn() -> AgentTurnContext:
    return AgentTurnContext.start(project_id="p1", conversation_id="c1", streaming=True)


def test_mark_running_stamps_a_heartbeat():
    conv = _conversation(status="completed")
    _turn().mark_running(conv, assistant_message_id="a1")
    lt = conv.context["last_turn"]
    assert lt["status"] == "running"
    assert "updated_at" in lt


def test_touch_running_moves_the_heartbeat_forward():
    conv = _conversation()
    before = conv.context["last_turn"]["updated_at"]
    _turn().touch_running(conv)
    after = conv.context["last_turn"]["updated_at"]
    assert after != before
    assert datetime.fromisoformat(after) > datetime.fromisoformat(before)


def test_touch_running_keeps_the_rest_of_the_turn():
    conv = _conversation()
    _turn().touch_running(conv)
    lt = conv.context["last_turn"]
    assert lt["turn_id"] == "old"
    assert lt["status"] == "running"
    assert "started_at" in lt


def test_touch_running_ignores_a_finished_turn():
    """A completed or failed turn must not be resurrected into `running`."""
    conv = _conversation(status="completed")
    original = dict(conv.context["last_turn"])
    _turn().touch_running(conv)
    assert conv.context["last_turn"] == original


def test_flush_refreshes_the_heartbeat(monkeypatch):
    """The flush that persists progress is itself progress."""
    from app.services.runtime.deep_agents import durable_stream as ds
    from app.services.runtime.deep_agents.stream_accumulator import ProjectStreamAccumulator

    conv = _conversation()
    turn = _turn()
    before = conv.context["last_turn"]["updated_at"]

    class _Msg:
        content = ""
        tool_calls = None

    class _Session:
        async def commit(self):
            return None

    asyncio.run(
        ds._flush_assistant_progress(
            _Session(),
            conv,
            _Msg(),
            ProjectStreamAccumulator(),
            turn=turn,
        )
    )
    assert conv.context["last_turn"]["updated_at"] != before
