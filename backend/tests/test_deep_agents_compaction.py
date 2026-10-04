"""Pre-turn context compaction vs deepagents 0.7 summarization API."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI

from app.services.deep_agents.context_compaction import compact_project_context_if_needed


@pytest.mark.asyncio
async def test_compact_passes_session_id_and_persists_it(monkeypatch) -> None:
    llm = ChatOpenAI(model="gpt-4o-mini", api_key="x", base_url="http://127.0.0.1:9/v1")
    backend = MagicMock()

    mw = MagicMock()
    mw._apply_event_to_messages.side_effect = lambda messages, _event: messages
    mw.token_counter = MagicMock(return_value=99_999)
    mw._should_summarize.side_effect = [True, False]
    mw._determine_cutoff_index.return_value = 2
    mw._partition_messages.return_value = (
        [HumanMessage(content="old-1"), HumanMessage(content="old-2")],
        [HumanMessage(content="keep")],
    )
    mw._aoffload_inline_media = AsyncMock(return_value=([HumanMessage(content="old")], 0))
    mw._get_session_id.return_value = "session_test"
    mw._aoffload_to_backend = AsyncMock(return_value="/conversation_history/session_test.md")
    mw._acreate_summary = AsyncMock(return_value="summary text")
    mw._build_new_messages_with_path.return_value = [HumanMessage(content="SUMMARY")]
    mw._compute_state_cutoff.return_value = 2

    monkeypatch.setattr(
        "app.services.deep_agents.context_compaction.create_summarization_middleware",
        lambda *_a, **_k: mw,
    )

    agent = MagicMock()
    snap = MagicMock()
    snap.values = {"messages": [HumanMessage(content="a"), HumanMessage(content="b"), HumanMessage(content="c")]}
    agent.aget_state = AsyncMock(return_value=snap)
    agent.aupdate_state = AsyncMock()

    rounds = await compact_project_context_if_needed(agent, {"configurable": {"thread_id": "t"}}, llm=llm, backend=backend)
    assert rounds == 1
    mw._aoffload_to_backend.assert_awaited()
    args = mw._aoffload_to_backend.await_args.args
    assert args[2] == "session_test"
    update = agent.aupdate_state.await_args.args[1]
    assert update["_summarization_session_id"] == "session_test"
    assert "_summarization_event" in update
