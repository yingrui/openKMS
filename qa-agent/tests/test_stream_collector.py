"""The event → NDJSON translation, without a graph.

`astream_agent_ndjson` used to be one 345-line generator: retrieval, the LangGraph loop, evidence collection, the fallback
invoke, grounding and the final payload. The translator is now a class, so what a client receives can be asserted directly
from the events instead of through a live model.
"""
from __future__ import annotations

import json

from langchain_core.messages import AIMessageChunk

from qa_agent.agent import _StreamCollector


def _line(raw: bytes | None) -> dict | None:
    return json.loads(raw.decode()) if raw is not None else None


class TestDelta:
    def test_a_streamed_chunk_becomes_a_delta_line(self):
        c = _StreamCollector()
        out = _line(c.observe({"event": "on_chat_model_stream", "data": {"chunk": AIMessageChunk(content="hello")}}))
        assert out == {"type": "delta", "t": "hello"}
        assert "".join(c.buf) == "hello"

    def test_a_chunk_without_text_yields_nothing(self):
        c = _StreamCollector()
        assert c.observe({"event": "on_chat_model_stream", "data": {"chunk": AIMessageChunk(content="")}}) is None
        assert c.buf == []


class TestTools:
    def test_start_and_end_are_reported_with_the_run_id(self):
        c = _StreamCollector()
        start = _line(
            c.observe({"event": "on_tool_start", "name": "kubectl_in_disguise", "run_id": "r1", "data": {"input": {"a": 1}}})
        )
        assert start == {"type": "tool_start", "run_id": "r1", "name": "kubectl_in_disguise", "input": '{"a": 1}'}
        end = _line(c.observe({"event": "on_tool_end", "name": "kubectl_in_disguise", "run_id": "r1", "data": {"output": "ok"}}))
        assert end == {"type": "tool_end", "run_id": "r1", "name": "kubectl_in_disguise", "output": "ok"}
        assert (c.tool_starts, c.tool_ends) == (1, 1)

    def test_a_tool_error_is_reported_and_counted(self):
        c = _StreamCollector()
        out = _line(
            c.observe({"event": "on_tool_error", "name": "t", "run_id": "r", "data": {"error": RuntimeError("boom")}})
        )
        assert out["type"] == "tool_error" and "boom" in out["error"]
        assert c.tool_errors == 1

    def test_an_unrelated_event_is_ignored(self):
        c = _StreamCollector()
        assert c.observe({"event": "on_chain_start", "name": "graph"}) is None
        assert c.graph_events == 1
