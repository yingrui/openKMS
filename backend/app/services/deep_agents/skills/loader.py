"""Load Deep Agents skills from project .openkms/skills/."""

from __future__ import annotations

from app.services.project_fs import resolve_project_path

# Relative path for SkillsMiddleware + virtual_mode backend (parent of skill dirs).
SKILLS_DIR_REL = ".openkms/skills"


def list_installed_skill_ids(project_id: str) -> list[str]:
    skills_dir = resolve_project_path(project_id, SKILLS_DIR_REL)
    if not skills_dir.is_dir():
        return []
    ids: list[str] = []
    for child in sorted(skills_dir.iterdir()):
        if child.is_dir() and (child / "SKILL.md").is_file():
            ids.append(child.name)
    return ids


def list_skill_paths(project_id: str) -> list[str]:
    """Return skill source path(s) for create_deep_agent SkillsMiddleware.

    deepagents expects each source to be a directory whose *children* contain
    SKILL.md (e.g. `.openkms/skills/openkms/SKILL.md`), not the skill leaf dir itself.
    """
    return [SKILLS_DIR_REL] if list_installed_skill_ids(project_id) else []
