"""Replay wiki agent ainvoke output as NDJSON stream parts."""

from __future__ import annotations

import asyncio

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from app.services.agent.wiki_runner import _replay_wiki_invoke_to_stream


async def _collect(parts_gen):
    out = []
    async for p in parts_gen:
        out.append(p)
    return out


def test_replay_tool_then_final_text() -> None:
    before = [HumanMessage("问")]
    ai1 = AIMessage(
        content="我先查一下。",
        tool_calls=[{"id": "call_1", "name": "list_wiki_pages", "args": {}}],
    )
    tm = ToolMessage(content="Pages:\n- a", tool_call_id="call_1", name="list_wiki_pages")
    ai2 = AIMessage(content="根据目录，答案是因子评价用 IC。")
    out = {"messages": [*before, ai1, tm, ai2]}
    parts = asyncio.run(_collect(_replay_wiki_invoke_to_stream(before, out)))
    types = [p["type"] for p in parts]
    assert types == ["delta", "tool_start", "tool_end", "delta"]
    assert parts[0]["t"] == "我先查一下。"
    assert parts[-1]["t"] == "根据目录，答案是因子评价用 IC。"


def test_replay_fatal_when_no_new_messages() -> None:
    before = [HumanMessage("x")]
    out = {"messages": list(before)}
    parts = asyncio.run(_collect(_replay_wiki_invoke_to_stream(before, out)))
    assert parts[0]["type"] == "fatal"
