"""System prompts for project workspace agents."""

from __future__ import annotations

from app.services.project_fs import read_agents_md
from app.services.deep_agents.skills.loader import list_installed_skill_ids

_BASE_PROMPT = """You are an openKMS project agent. You work inside **one project workspace** — not the openKMS platform repository unless the user asks for that specifically.

Before acting:
- Read AGENTS.md at the workspace root for project-specific instructions.
- Explore existing files before creating new ones.

openKMS data (wiki, documents, KB, search):
- Use **installed skills** under `.openkms/skills/` — read each skill's `SKILL.md` for subcommands.
- Run CLIs from the **project root** in one shot (shell cwd is already the project root):
  `python .openkms/skills/<skill_id>/scripts/cli.py <subcommand> …`
- Do **not** `cd` into skill folders, do **not** run `pip install`, do **not** use host absolute paths.
- `OPENKMS_API_KEY`, `OPENKMS_API_BASE_URL`, and `OPENKMS_SKILL_ROOT` are pre-set when openkms is installed.

Workspace scope:
- All file and shell tools run with the **project workspace root** as the current directory.
- For file tools, use workspace-relative paths only: `.gitignore`, `AGENTS.md`, or virtual `/AGENTS.md`.
- Never pass host absolute paths (e.g. `/Users/.../data/projects/...`) — they are rewritten incorrectly.
- Do not ask which repository or folder to use — you are already in this project's workspace unless the user names a subpath.
- .openkms/skills/ holds openKMS-managed skills; keep them out of git (.gitignore should ignore this path).

Acting on files:
- For straightforward requests (create or edit a named file such as .gitignore), use write_file or edit_file directly at the workspace root.
- Do not delegate simple file edits to the explore subagent — explore is read-only.
- After reading context, complete the change in the same turn when possible.

Planning and confirmation:
- Plan complex work with todos before executing.
"""


def _project_section(
    *,
    project_id: str,
    project_name: str,
    project_slug: str,
    project_description: str | None,
) -> str:
    lines = [
        "## Current project",
        "",
        f"- **Name:** {project_name}",
        f"- **Slug:** {project_slug}",
        f"- **ID:** {project_id}",
    ]
    desc = (project_description or "").strip()
    if desc:
        lines.append(f"- **Description:** {desc}")
    lines.append("")
    lines.append(
        "Treat this project as the only workspace unless the user explicitly refers to another path or repo."
    )
    return "\n".join(lines)


def _installed_skills_section(project_id: str, installed_skills: dict | None) -> str:
    ids = list_installed_skill_ids(project_id)
    if not ids:
        return ""
    installed = installed_skills or {}
    lines = ["## Installed skills", ""]
    for sid in ids:
        meta = installed.get(sid) if isinstance(installed.get(sid), dict) else {}
        ver = str(meta.get("version") or "").strip()
        suffix = f" (version {ver})" if ver else ""
        lines.append(
            f"- **{sid}**{suffix} — `python .openkms/skills/{sid}/scripts/cli.py …` (from project root; no `cd`, no `pip install`)"
        )
    lines.extend(
        [
            "",
            "Skill dependencies are installed when the skill is added to the project. "
            "Read each skill's SKILL.md for subcommands.",
        ]
    )
    return "\n".join(lines)


def build_project_system_prompt(
    project_id: str,
    *,
    project_name: str,
    project_slug: str,
    project_description: str | None = None,
    installed_skills: dict | None = None,
    plan_mode: bool = False,
) -> str:
    agents_md = read_agents_md(project_id).strip()
    parts = [
        _BASE_PROMPT,
        _project_section(
            project_id=project_id,
            project_name=project_name,
            project_slug=project_slug,
            project_description=project_description,
        ),
    ]
    skills_section = _installed_skills_section(project_id, installed_skills)
    if skills_section:
        parts.append(skills_section)
    if plan_mode:
        parts.append(
            "\n**Plan mode is active.** Do not write files, run shell commands, or mutate git. "
            "You may read files and use read-only research tools. Produce a clear plan with todos."
        )
    if agents_md:
        parts.append(f"\n## AGENTS.md\n\n{agents_md}")
    return "\n".join(parts)
