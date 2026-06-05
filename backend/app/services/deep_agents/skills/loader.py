"""Load Deep Agents skills from project .openkms/skills/."""

from __future__ import annotations

from pathlib import Path

from app.services.project_fs import resolve_project_path


def list_skill_paths(project_id: str) -> list[str]:
    skills_dir = resolve_project_path(project_id, ".openkms/skills")
    if not skills_dir.is_dir():
        return []
    paths: list[str] = []
    for child in sorted(skills_dir.iterdir()):
        if child.is_dir() and (child / "SKILL.md").is_file():
            paths.append(str(child))
    return paths
