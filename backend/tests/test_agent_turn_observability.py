"""Tests for project agent turn observability logging."""

from __future__ import annotations

import logging

from app.services.deep_agents.observability import AgentTurnContext


def test_agent_turn_success_logs_info(caplog):
    caplog.set_level(logging.INFO, logger="app.services.deep_agents.observability")
    turn = AgentTurnContext.start(
        project_id="proj-1",
        conversation_id="conv-1",
        streaming=True,
    )
    turn.log_done(tool_count=2, assistant_chars=100)
    messages = [r.message for r in caplog.records]
    assert any("agent_turn_start" in m for m in messages)
    assert any("agent_turn_done" in m for m in messages)
    assert not any(r.levelno >= logging.ERROR for r in caplog.records)


def test_agent_turn_failure_logs_error_not_info(caplog):
    caplog.set_level(logging.INFO, logger="app.services.deep_agents.observability")
    turn = AgentTurnContext.start(
        project_id="proj-1",
        conversation_id="conv-1",
        scheduled_run=True,
    )
    turn.log_failed("Recursion limit exceeded")
    error_records = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert len(error_records) == 1
    assert "agent_turn_failed" in error_records[0].message
    assert "Recursion limit exceeded" in error_records[0].message


def test_agent_turn_failure_with_exc_logs_error(caplog):
    caplog.set_level(logging.INFO, logger="app.services.deep_agents.observability")
    turn = AgentTurnContext(
        project_id="p",
        conversation_id="c",
    )
    try:
        raise RuntimeError("boom")
    except RuntimeError as e:
        turn.log_failed(str(e), exc=e)
    assert any(r.levelno == logging.ERROR and r.exc_info for r in caplog.records)


def test_apply_last_turn_on_conversation():
    from app.models.agent_models import AgentConversation

    turn = AgentTurnContext(project_id="p", conversation_id="c")
    conv = AgentConversation(id="c", user_sub="u", surface="project", context={})
    turn.apply_last_turn(conv, status="failed", error="boom", tool_count=2)
    assert conv.context["last_turn"]["turn_id"] == turn.turn_id
    assert conv.context["last_turn"]["status"] == "failed"
    assert conv.context["last_turn"]["error"] == "boom"
    assert conv.context["last_turn"]["tool_count"] == 2


def test_agent_turn_idempotent_finish(caplog):
    caplog.set_level(logging.INFO, logger="app.services.deep_agents.observability")
    turn = AgentTurnContext(project_id="p", conversation_id="c")
    turn.log_failed("once")
    turn.log_failed("twice")
    turn.log_done(tool_count=1)
    assert sum(1 for r in caplog.records if "agent_turn_failed" in r.message) == 1
    assert not any("agent_turn_done" in r.message for r in caplog.records)
