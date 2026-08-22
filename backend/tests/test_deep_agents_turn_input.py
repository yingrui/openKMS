"""Tests for checkpoint-first turn input and turn preparation."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import HumanMessage

from app.services.agent.tool_transcripts import AGENT_TOOL_TRANSCRIPTS_KEY
from app.services.deep_agents.turn_input import (
    resolve_turn_input_messages,
    seed_messages_from_db,
)
from app.services.deep_agents.turn_prepare import prepare_workspace_turn_messages


def _row(role: str, content: str, tool_calls=None):
    return SimpleNamespace(role=role, content=content, tool_calls=tool_calls)


def test_seed_messages_from_db_omits_tool_traces() -> None:
    rows = [
        _row("user", "question"),
        _row(
            "assistant",
            "answer",
            {AGENT_TOOL_TRANSCRIPTS_KEY: [{"name": "read_file", "output": "big output"}]},
        ),
    ]
    msgs = seed_messages_from_db(rows)
    assert len(msgs) == 2
    assert msgs[1].content == "answer"


@pytest.mark.asyncio
async def test_resolve_turn_input_seeds_when_no_checkpoint() -> None:
    agent = MagicMock()
    agent.aget_state = AsyncMock(return_value=SimpleNamespace(values={}))
    rows = [_row("user", "hello")]
    msgs = await resolve_turn_input_messages(agent, {}, rows)
    assert len(msgs) == 1
    assert msgs[0].content == "hello"


@pytest.mark.asyncio
async def test_resolve_turn_input_appends_only_latest_user_when_checkpoint_exists() -> None:
    agent = MagicMock()
    agent.aget_state = AsyncMock(
        return_value=SimpleNamespace(
            values={"messages": [HumanMessage(content="prior turn")]},
        ),
    )
    rows = [
        _row("user", "first"),
        _row("assistant", "ok"),
        _row("user", "follow-up"),
    ]
    msgs = await resolve_turn_input_messages(agent, {}, rows)
    assert len(msgs) == 1
    assert msgs[0].content == "follow-up"


@pytest.mark.asyncio
async def test_prepare_workspace_turn_messages_compacts_then_resolves() -> None:
    agent = MagicMock()
    agent.aget_state = AsyncMock(return_value=SimpleNamespace(values={}))
    rows = [_row("user", "hi")]
    llm = MagicMock()
    backend = MagicMock()

    with patch(
        "app.services.deep_agents.turn_prepare.compact_project_context_if_needed",
        new_callable=AsyncMock,
        return_value=1,
    ) as compact:
        msgs = await prepare_workspace_turn_messages(
            agent, {}, rows, llm=llm, backend=backend,
        )

    compact.assert_awaited_once()
    assert len(msgs) == 1
    assert msgs[0].content == "hi"
