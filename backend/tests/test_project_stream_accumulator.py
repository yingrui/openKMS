"""Project stream accumulator persists interleaved UI parts."""

from __future__ import annotations

from app.services.agent.assistant_stream_parts import WIKI_ASSISTANT_STREAM_PARTS_KEY
from app.services.agent.tool_transcripts import AGENT_TOOL_TRANSCRIPTS_KEY, tool_payload_from_traces
from app.services.deep_agents.stream_accumulator import ProjectStreamAccumulator


def test_accumulator_interleaved_order_for_storage() -> None:
    acc = ProjectStreamAccumulator()
    assert acc.absorb({"type": "delta", "t": "Before "}) == "continue"
    assert acc.absorb({"type": "tool_start", "run_id": "r1", "name": "read_file", "input": "{}"}) == "continue"
    assert acc.absorb({"type": "tool_end", "run_id": "r1", "name": "read_file", "output": "ok"}) == "continue"
    assert acc.absorb({"type": "delta", "t": "After."}) == "continue"

    parts = acc.interleaved_parts_for_storage()
    assert [p["type"] for p in parts] == ["text", "tool", "text"]
    assert parts[0]["text"] == "Before "
    assert parts[1]["name"] == "read_file"
    assert parts[1]["status"] == "ok"
    assert parts[2]["text"] == "After."
    assert acc.assistant_text == "Before After."

    payload = tool_payload_from_traces(acc.tool_traces, stream_parts=parts)
    assert payload is not None
    assert AGENT_TOOL_TRANSCRIPTS_KEY in payload
    assert payload[WIKI_ASSISTANT_STREAM_PARTS_KEY] == parts


def test_tool_payload_stream_parts_only() -> None:
    parts = [{"type": "text", "text": "hi"}]
    payload = tool_payload_from_traces([], stream_parts=parts)
    assert payload == {WIKI_ASSISTANT_STREAM_PARTS_KEY: parts}
