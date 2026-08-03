"""Accumulate project agent stream parts for DB persistence."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

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
    """Collect assistant text and tool traces while forwarding NDJSON to the client."""

    text_parts: list[str] = field(default_factory=list)
    tool_traces: list[dict[str, str]] = field(default_factory=list)
    tool_inputs: dict[str, str] = field(default_factory=dict)
    interrupted: bool = False
    interrupt_payload: dict | None = None

    def absorb(self, part: ProjectStreamPart) -> Literal["continue", "fatal", "interrupt"]:
        ptype = part.get("type")
        if ptype == "delta" and part.get("t"):
            self.text_parts.append(part["t"])
        elif ptype == "tool_start":
            run_id = str(part.get("run_id") or "")
            inp = part.get("input")
            if run_id and isinstance(inp, str):
                self.tool_inputs[run_id] = inp
        elif ptype == "tool_end":
            name = str(part.get("name") or "tool")
            trace: dict[str, str] = {
                "name": name,
                "output": str(part.get("output") or ""),
            }
            run_id = str(part.get("run_id") or "")
            if run_id and run_id in self.tool_inputs:
                trace["input"] = self.tool_inputs[run_id]
            self.tool_traces.append(trace)
        elif ptype == "tool_error":
            name = str(part.get("name") or "tool")
            trace = {
                "name": name,
                "error": str(part.get("error") or ""),
            }
            run_id = str(part.get("run_id") or "")
            if run_id and run_id in self.tool_inputs:
                trace["input"] = self.tool_inputs[run_id]
            self.tool_traces.append(trace)
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
