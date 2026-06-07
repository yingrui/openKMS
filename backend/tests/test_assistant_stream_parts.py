"""Assistant stream parts builder for interleaved chat replay."""

from __future__ import annotations

from app.services.agent.assistant_stream_parts import (
    WIKI_ASSISTANT_STREAM_PARTS_KEY,
    AssistantStreamPartsBuilder,
)


def test_stream_parts_interleaved_order() -> None:
    b = AssistantStreamPartsBuilder()
    acc: list[str] = []
    traces: list[dict[str, str]] = []

    b.apply_stream_event({"type": "delta", "t": "Plan: "}, acc, traces)
    b.apply_stream_event({"type": "tool_start", "run_id": "r1", "name": "search_tool"}, acc, traces)
    b.apply_stream_event({"type": "tool_end", "run_id": "r1", "name": "search_tool", "output": "ok"}, acc, traces)
    b.apply_stream_event({"type": "delta", "t": "Done."}, acc, traces)

    parts = b.parts
    assert [p["type"] for p in parts] == ["text", "tool", "text"]
    assert parts[1]["status"] == "ok"
    assert parts[0]["text"] == "Plan: "
    assert parts[2]["text"] == "Done."
    assert acc == ["Plan: ", "Done."]
    assert traces == [{"name": "search_tool", "output": "ok"}]


def test_stream_parts_key_constant() -> None:
    assert WIKI_ASSISTANT_STREAM_PARTS_KEY == "wiki_assistant_stream_parts_v1"
