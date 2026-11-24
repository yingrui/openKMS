"""Interleaved assistant stream parts (text + tools) for chat UI replay on session reload."""

from __future__ import annotations

import time
from typing import Any

from app.services.runtime.agent.shared import truncate_wiki_tool_output_for_storage

WIKI_ASSISTANT_STREAM_PARTS_KEY = "wiki_assistant_stream_parts_v1"

_MAX_TOOL_INPUT_STORAGE = 6000


def _truncate_input(text: str) -> str:
    return truncate_wiki_tool_output_for_storage(text, max_len=_MAX_TOOL_INPUT_STORAGE)


class AssistantStreamPartsBuilder:
    """Build interleaved stream parts mirroring frontend ``wikiCopilotStreamParts`` helpers."""

    def __init__(self) -> None:
        self._parts: list[dict[str, Any]] = []
        #: `run_id → monotonic start`, so a stored trace keeps the duration the live stream showed.
        self._started: dict[str, float] = {}

    @property
    def parts(self) -> list[dict[str, Any]]:
        return self._parts

    def append_delta(self, text: str) -> None:
        if not text:
            return
        if self._parts and self._parts[-1].get("type") == "text":
            self._parts[-1]["text"] = str(self._parts[-1].get("text") or "") + text
        else:
            self._parts.append({"type": "text", "text": text})

    def tool_start(self, run_id: str, name: str, input_text: str = "") -> None:
        # Wall time between the start and end events is the only duration the trace can carry: the agent's events do not
        # stamp time, and a stored turn that loses it shows no duration where the live one did.
        if run_id:
            self._started[run_id] = time.monotonic()
        row: dict[str, Any] = {
            "type": "tool",
            "run_id": run_id,
            "name": name,
            "status": "running",
        }
        if input_text:
            row["input"] = _truncate_input(input_text)
        self._parts.append(row)

    def tool_end(self, run_id: str, name: str, output: str = "") -> None:
        duration_ms = self._duration_ms(run_id)
        idx = self._find_tool_index(run_id)
        stored_out = truncate_wiki_tool_output_for_storage(output) if output else ""
        if idx >= 0:
            row = self._parts[idx]
            row["name"] = name
            row["status"] = "ok"
            if duration_ms is not None:
                row["duration_ms"] = duration_ms
            if stored_out:
                row["output"] = stored_out
        else:
            row = {"type": "tool", "run_id": run_id, "name": name, "status": "ok"}
            if duration_ms is not None:
                row["duration_ms"] = duration_ms
            if stored_out:
                row["output"] = stored_out
            self._parts.append(row)

    def _duration_ms(self, run_id: str) -> int | None:
        started = self._started.pop(run_id, None) if run_id else None
        return int((time.monotonic() - started) * 1000) if started is not None else None

    def tool_error(self, run_id: str, name: str, error: str = "") -> None:
        duration_ms = self._duration_ms(run_id)
        idx = self._find_tool_index(run_id)
        stored_err = truncate_wiki_tool_output_for_storage(error) if error else "Tool error"
        if idx >= 0:
            row = self._parts[idx]
            row["name"] = name
            row["status"] = "err"
            row["error"] = stored_err
            if duration_ms is not None:
                row["duration_ms"] = duration_ms
        else:
            self._parts.append(
                {
                    "type": "tool",
                    "run_id": run_id,
                    "name": name,
                    "status": "err",
                    "error": stored_err,
                }
            )

    def _find_tool_index(self, run_id: str) -> int:
        if run_id:
            for i, part in enumerate(self._parts):
                if part.get("type") == "tool" and part.get("run_id") == run_id:
                    return i
            return -1
        for i in range(len(self._parts) - 1, -1, -1):
            part = self._parts[i]
            if part.get("type") == "tool" and part.get("status") == "running":
                return i
        return -1

    def apply_stream_event(
        self,
        ev: dict[str, Any],
        acc: list[str],
        tool_traces: list[dict[str, str]],
    ) -> None:
        """Update acc, tool_traces, and interleaved parts from one NDJSON stream event."""
        typ = ev.get("type")
        if typ == "delta" and isinstance(ev.get("t"), str):
            t = str(ev["t"])
            acc.append(t)
            self.append_delta(t)
            return
        if typ == "tool_start" and isinstance(ev.get("name"), str):
            self.tool_start(
                str(ev.get("run_id") or ""),
                str(ev.get("name") or "tool"),
                str(ev.get("input") or ""),
            )
            return
        if typ == "tool_end" and isinstance(ev.get("name"), str):
            tname = str(ev.get("name") or "tool")
            tout = str(ev.get("output") or "")
            run_id = str(ev.get("run_id") or "")
            if tout.strip():
                tool_traces.append(
                    {
                        "name": tname,
                        "output": truncate_wiki_tool_output_for_storage(tout),
                    }
                )
            self.tool_end(run_id, tname, tout)
            return
        if typ == "tool_error" and isinstance(ev.get("name"), str):
            tname = str(ev.get("name") or "tool")
            terr = str(ev.get("error") or "Tool error")
            run_id = str(ev.get("run_id") or "")
            tool_traces.append(
                {
                    "name": tname,
                    "output": truncate_wiki_tool_output_for_storage(terr),
                }
            )
            self.tool_error(run_id, tname, terr)
