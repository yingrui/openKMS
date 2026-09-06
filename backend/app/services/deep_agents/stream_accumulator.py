"""Accumulate project agent stream parts for DB persistence."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal

from app.services.agent.assistant_stream_parts import AssistantStreamPartsBuilder
from app.services.deep_agents.stream_events import ProjectStreamPart

_COMPACTION_BLOCK_RE = re.compile(
    r"SESSION INTENT\s*\n.*?\nNEXT STEPS\s*\n.*?(?=\n\n|\nSESSION INTENT|\Z)",
    re.DOTALL,
)


def strip_leaked_compaction_text(text: str) -> str:
    """Drop Deep Agents SESSION INTENT blocks if they leaked into assistant text."""
    if "SESSION INTENT" not in text or "NEXT STEPS" not in text:
        return text
    cleaned = _COMPACTION_BLOCK_RE.sub("", text).strip()
    return cleaned if cleaned else text


@dataclass
class ProjectStreamAccumulator:
    """Collect assistant text, tool traces, and interleaved UI parts while streaming."""

    text_parts: list[str] = field(default_factory=list)
    tool_traces: list[dict[str, str]] = field(default_factory=list)
    tool_inputs: dict[str, str] = field(default_factory=dict)
    stream_parts: AssistantStreamPartsBuilder = field(default_factory=AssistantStreamPartsBuilder)
    interrupted: bool = False
    interrupt_payload: dict | None = None

    def absorb(self, part: ProjectStreamPart) -> Literal["continue", "fatal", "interrupt"]:
        ptype = part.get("type")
        if ptype == "delta" and part.get("t"):
            chunk = str(part["t"])
            self.text_parts.append(chunk)
            self.stream_parts.append_delta(chunk)
        elif ptype == "tool_start":
            run_id = str(part.get("run_id") or "")
            name = str(part.get("name") or "tool")
            inp = part.get("input")
            inp_s = inp if isinstance(inp, str) else ""
            if run_id and inp_s:
                self.tool_inputs[run_id] = inp_s
            self.stream_parts.tool_start(run_id, name, inp_s)
        elif ptype == "tool_end":
            name = str(part.get("name") or "tool")
            output = str(part.get("output") or "")
            trace: dict[str, str] = {
                "name": name,
                "output": output,
            }
            run_id = str(part.get("run_id") or "")
            if run_id and run_id in self.tool_inputs:
                trace["input"] = self.tool_inputs[run_id]
            self.tool_traces.append(trace)
            self.stream_parts.tool_end(run_id, name, output)
        elif ptype == "tool_error":
            name = str(part.get("name") or "tool")
            error = str(part.get("error") or "")
            trace = {
                "name": name,
                "error": error,
            }
            run_id = str(part.get("run_id") or "")
            if run_id and run_id in self.tool_inputs:
                trace["input"] = self.tool_inputs[run_id]
            self.tool_traces.append(trace)
            self.stream_parts.tool_error(run_id, name, error)
        elif ptype == "interrupt":
            self.interrupted = True
            raw = part.get("interrupt")
            if isinstance(raw, dict):
                self.interrupt_payload = _merge_interrupt_payload(self.interrupt_payload, raw)
        elif ptype == "fatal":
            return "fatal"
        return "interrupt" if self.interrupted else "continue"

    @property
    def assistant_text(self) -> str:
        return strip_leaked_compaction_text("".join(self.text_parts))

    def interleaved_parts_for_storage(self) -> list[dict[str, Any]]:
        """UI replay parts (text + tools in stream order), with compaction leaks stripped."""
        out: list[dict[str, Any]] = []
        for part in self.stream_parts.parts:
            if part.get("type") == "text":
                cleaned = strip_leaked_compaction_text(str(part.get("text") or ""))
                if cleaned:
                    out.append({"type": "text", "text": cleaned})
                continue
            out.append(dict(part))
        return out


def _merge_interrupt_payload(
    existing: dict | None,
    incoming: dict,
) -> dict:
    """Merge HITL interrupt events so the UI can show all pending action_requests."""
    if not existing:
        return dict(incoming)

    def _requests(d: dict) -> list:
        nested = d.get("value")
        src = nested if isinstance(nested, dict) and "action_requests" in nested else d
        reqs = src.get("action_requests")
        return list(reqs) if isinstance(reqs, list) else []

    merged_reqs = _requests(existing) + _requests(incoming)
    if not merged_reqs:
        return dict(incoming)
    out = dict(existing)
    out["action_requests"] = merged_reqs
    if "value" in out and isinstance(out["value"], dict):
        out["value"] = {**out["value"], "action_requests": merged_reqs}
    return out
