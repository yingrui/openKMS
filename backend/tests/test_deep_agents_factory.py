"""Tests for deep_agents.factory and runner error paths."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.runtime.deep_agents.constants import STALE_RUNNING_SECONDS, STALLED_TURN_SECONDS
from app.services.runtime.deep_agents.factory import ephemeral_runnable_config
from app.services.runtime.deep_agents.llm_chat import normalize_openai_base_url
from app.services.runtime.deep_agents.runner import iter_project_stream_parts
from app.services.runtime.agent.tool_transcripts import (
    AGENT_TOOL_TRANSCRIPTS_KEY,
    tool_payload_from_traces,
    truncate_tool_output_for_storage,
)


def test_normalize_openai_base_url() -> None:
    assert normalize_openai_base_url("https://api.deepseek.com") == "https://api.deepseek.com/v1"
    assert normalize_openai_base_url("https://api.deepseek.com/v1/") == "https://api.deepseek.com/v1"


def test_stale_running_seconds_matches_frontend_window() -> None:
    """The lease must expire fast enough that a dead turn does not block a session for long."""
    assert STALE_RUNNING_SECONDS == 10 * 60


def test_stalled_window_is_shorter_than_the_lease() -> None:
    """Stop *claiming* progress before a competing turn may take over."""
    assert 0 < STALLED_TURN_SECONDS < STALE_RUNNING_SECONDS


def test_tool_payload_from_traces() -> None:
    traces = [{"name": "read_file", "output": "ok"}]
    payload = tool_payload_from_traces(traces)
    assert payload == {AGENT_TOOL_TRANSCRIPTS_KEY: traces}


def test_truncate_tool_output_for_storage() -> None:
    long = "x" * 50_000
    out = truncate_tool_output_for_storage(long, max_len=100)
    assert len(out) <= 100
    assert out.endswith("…[truncated for storage]")


def test_ephemeral_runnable_config_has_recursion_limit(monkeypatch) -> None:
    monkeypatch.setattr("app.config.settings.agent_recursion_limit", 42)
    cfg = ephemeral_runnable_config(thread_prefix="improvement")
    assert cfg["recursion_limit"] == 42
    assert cfg["configurable"]["thread_id"].startswith("improvement-")


@pytest.mark.asyncio
async def test_iter_project_stream_parts_yields_fatal_on_stream_error() -> None:
    conversation = MagicMock()
    conversation.id = "conv-1"

    async def fake_build(*_a, **_k):
        ctx = _k.get("build_ctx")
        if ctx is not None:
            ctx.llm = MagicMock()
            ctx.backend = MagicMock()
        return MagicMock(), None

    with patch(
        "app.services.runtime.deep_agents.runner.build_workspace_deep_agent",
        side_effect=fake_build,
    ), patch(
        "app.services.runtime.deep_agents.runner._conversation_message_rows",
        new_callable=AsyncMock,
        return_value=[],
    ), patch(
        "app.services.runtime.deep_agents.runner.prepare_workspace_turn_messages",
        new_callable=AsyncMock,
        return_value=[],
    ), patch(
        "app.services.runtime.deep_agents.runner.iter_langgraph_stream_parts",
    ) as mock_stream:

        async def stream_error(*_a, **_k):
            raise RuntimeError("gateway down")
            yield  # pragma: no cover

        mock_stream.side_effect = stream_error

        parts = [
            p
            async for p in iter_project_stream_parts(
                AsyncMock(),
                conversation,
                {},
                "token",
                "proj",
                "P",
                "slug",
                None,
                {},
            )
        ]
    assert parts == [{"type": "fatal", "message": "gateway down"}]
