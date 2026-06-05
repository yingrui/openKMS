"""System prompts for project workspace agents."""

from __future__ import annotations

from app.services.project_fs import read_agents_md


_BASE_PROMPT = """You are an openKMS project agent working in the user's workspace folder.

- Read AGENTS.md for project-specific instructions before acting.
- Plan complex work with todos before executing.
- Ask for user confirmation when a decision materially affects the project (the system may interrupt sensitive tools).
- Prefer exploring existing files before creating new ones.
- When researching openKMS content, use provided tools rather than guessing.
"""


def build_project_system_prompt(project_id: str, *, plan_mode: bool = False) -> str:
    agents_md = read_agents_md(project_id).strip()
    parts = [_BASE_PROMPT]
    if plan_mode:
        parts.append(
            "\n**Plan mode is active.** Do not write files, run shell commands, or mutate git. "
            "You may read files and use read-only research tools. Produce a clear plan with todos."
        )
    if agents_md:
        parts.append(f"\n## AGENTS.md\n\n{agents_md}")
    return "\n".join(parts)
