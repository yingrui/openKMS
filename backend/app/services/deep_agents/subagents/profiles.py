"""Built-in subagent profiles for project agents."""

from __future__ import annotations

from typing import Any


def build_subagents(*, plan_mode: bool, include_shell: bool = True) -> list[dict[str, Any]]:
    """Dictionary-based subagents for create_deep_agent."""
    explore: dict[str, Any] = {
        "name": "explore",
        "description": "Read-only exploration of project workspace files.",
        "system_prompt": (
            "You explore the current project's workspace files only. "
            "File paths are relative to the project root. Read and search only; "
            "Do not write or execute destructive commands. Return concise findings."
        ),
    }
    research: dict[str, Any] = {
        "name": "research",
        "description": "Deep research using web search and installed skills.",
        "system_prompt": (
            "You perform deep research: web search and installed skill CLIs when relevant. "
            "Synthesize findings with citations. Do not mutate the project unless asked."
        ),
    }
    out = [explore, research]
    if include_shell and not plan_mode:
        out.append(
            {
                "name": "shell",
                "description": "Run sandboxed Python and shell commands in the project folder.",
                "system_prompt": (
                    "You run short Python scripts and shell commands in the current project's workspace root. "
                    "Prefer Python for data work. Report stdout/stderr clearly."
                ),
            }
        )
    return out
