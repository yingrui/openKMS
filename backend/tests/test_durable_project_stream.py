"""Tests for disconnect-safe project stream helpers."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models.agent_models import AgentConversation
from app.services.deep_agents.durable_stream import conversation_turn_is_active
from app.services.deep_agents.observability import AgentTurnContext


def test_conversation_turn_is_active_running():
    started = datetime.now(timezone.utc).isoformat()
    c = AgentConversation(
        id="c1",
        user_sub="u",
        surface="project",
        context={"last_turn": {"status": "running", "started_at": started}},
    )
    assert conversation_turn_is_active(c) is True


def test_conversation_turn_is_active_completed():
    c = AgentConversation(
        id="c1",
        user_sub="u",
        surface="project",
        context={"last_turn": {"status": "completed", "started_at": datetime.now(timezone.utc).isoformat()}},
    )
    assert conversation_turn_is_active(c) is False


def test_conversation_turn_is_active_stale_running():
    started = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
    c = AgentConversation(
        id="c1",
        user_sub="u",
        surface="project",
        context={"last_turn": {"status": "running", "started_at": started}},
    )
    assert conversation_turn_is_active(c) is False


def test_mark_running_preserves_assistant_id_on_complete():
    turn = AgentTurnContext(project_id="p", conversation_id="c")
    conv = AgentConversation(id="c", user_sub="u", surface="project", context={})
    turn.mark_running(conv, assistant_message_id="asst-1")
    assert conv.context["last_turn"]["status"] == "running"
    assert conv.context["last_turn"]["assistant_message_id"] == "asst-1"
    turn.log_done(tool_count=1, conversation=conv)
    assert conv.context["last_turn"]["status"] == "completed"
    assert conv.context["last_turn"]["assistant_message_id"] == "asst-1"
    assert "interrupt" not in conv.context["last_turn"]


def test_interrupted_last_turn_stores_interrupt_payload():
    turn = AgentTurnContext(project_id="p", conversation_id="c")
    conv = AgentConversation(id="c", user_sub="u", surface="project", context={})
    turn.mark_running(conv, assistant_message_id="asst-1")
    payload = {"action_requests": [{"name": "execute", "description": "Run shell"}]}
    turn.apply_last_turn(
        conv,
        status="interrupted",
        tool_count=1,
        assistant_message_id="asst-1",
        interrupt=payload,
    )
    assert conv.context["last_turn"]["status"] == "interrupted"
    assert conv.context["last_turn"]["interrupt"] == payload
    turn.apply_last_turn(conv, status="completed", tool_count=1, assistant_message_id="asst-1")
    assert "interrupt" not in conv.context["last_turn"]
