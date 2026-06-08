"""Accumulate project agent stream parts for DB persistence."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.services.deep_agents.stream_events import ProjectStreamPart


@dataclass
class ProjectStreamAccumulator:
    """Collect assistant text and tool traces while forwarding NDJSON to the client."""

    text_parts: list[str] = field(default_factory=list)
    tool_traces: list[dict[str, str]] = field(default_factory=list)
    tool_inputs: dict[str, str] = field(default_factory=dict)
    interrupted: bool = False

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
        elif ptype == "fatal":
            return "fatal"
        return "interrupt" if self.interrupted else "continue"

    @property
    def assistant_text(self) -> str:
        return "".join(self.text_parts)
