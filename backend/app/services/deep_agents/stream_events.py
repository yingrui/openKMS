"""Map LangGraph astream_events payloads to project agent NDJSON parts."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any, Literal, TypedDict

from langchain_core.messages import AIMessageChunk


class ProjectStreamPart(TypedDict, total=False):
    type: Literal[
        "delta",
        "tool_start",
        "tool_end",
        "tool_error",
        "todo",
        "interrupt",
        "subagent_start",
        "subagent_end",
        "fatal",
    ]
    t: str
    run_id: str
    name: str
    input: str
    output: str
    error: str
    message: str
    todos: list
    interrupt: dict


def _tool_io_preview(x: Any, max_len: int) -> str:
    if x is None:
        return ""
    try:
        s = x if isinstance(x, str) else json.dumps(x, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        s = str(x)
    return s[: max_len - 18] + "…[truncated]" if len(s) > max_len else s


def _message_to_stream_text_raw(chunk: Any) -> str:
    if chunk is None:
        return ""
    if isinstance(chunk, AIMessageChunk):
        c = chunk.content
        if isinstance(c, str):
            return c
        if isinstance(c, list):
            parts: list[str] = []
            for b in c:
                if isinstance(b, str):
                    parts.append(b)
                elif isinstance(b, dict) and b.get("type") == "text":
                    parts.append(str(b.get("text") or ""))
            return "".join(parts)
    if hasattr(chunk, "content"):
        c = getattr(chunk, "content", "")
        return c if isinstance(c, str) else ""
    return ""


class LangGraphStreamAdapter:
    """Stateful mapper for on_chat_model_stream / on_tool_* LangGraph events."""

    def __init__(self) -> None:
        self._pending_subagent: str | None = None

    def parts_from_event(self, ev: dict) -> list[ProjectStreamPart]:
        ename = (ev.get("event") or "") if isinstance(ev, dict) else ""
        data = ev.get("data") or {}
        out: list[ProjectStreamPart] = []

        if ename == "on_chat_model_stream":
            t = _message_to_stream_text_raw(data.get("chunk"))
            if t:
                out.append({"type": "delta", "t": t})
            return out

        if ename == "on_tool_start":
            name = (ev.get("name") or "tool").split("/")[-1]
            if name == "write_todos":
                inp = data.get("input")
                if isinstance(inp, dict) and inp.get("todos"):
                    out.append({"type": "todo", "todos": inp["todos"]})
            if name == "task":
                label = str(data.get("input") or "")[:200]
                self._pending_subagent = label
                out.append({"type": "subagent_start", "name": label})
            run_id = str(ev.get("run_id") or "")
            out.append(
                {
                    "type": "tool_start",
                    "run_id": run_id,
                    "name": name,
                    "input": _tool_io_preview(data.get("input"), 6000),
                }
            )
            return out

        if ename == "on_tool_end":
            name = (ev.get("name") or "tool").split("/")[-1]
            if name == "task":
                out.append(
                    {
                        "type": "subagent_end",
                        "name": self._pending_subagent or name,
                    }
                )
                self._pending_subagent = None
            run_id = str(ev.get("run_id") or "")
            out.append(
                {
                    "type": "tool_end",
                    "run_id": run_id,
                    "name": name,
                    "output": _tool_io_preview(data.get("output"), 10000),
                }
            )
            return out

        if ename == "on_tool_error":
            run_id = str(ev.get("run_id") or "")
            name = (ev.get("name") or "tool").split("/")[-1]
            err_obj = data.get("error")
            out.append(
                {
                    "type": "tool_error",
                    "run_id": run_id,
                    "name": name,
                    "error": _tool_io_preview(str(err_obj), 2000),
                }
            )
            return out

        return out


async def iter_langgraph_stream_parts(agent, graph_input: Any, cfg: dict) -> AsyncIterator[ProjectStreamPart]:
    adapter = LangGraphStreamAdapter()
    async for ev in agent.astream_events(graph_input, cfg, version="v2"):
        if not isinstance(ev, dict):
            continue
        for part in adapter.parts_from_event(ev):
            yield part
