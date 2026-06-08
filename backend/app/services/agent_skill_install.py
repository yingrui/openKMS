"""Install agent skills from the global registry into a project workspace."""

from __future__ import annotations

import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.agent_skill import AgentSkill, AgentSkillVersion
from app.models.project import Project
from app.services.agent_skills_registry import resolve_version_for_skill, version_dir
from app.services.project_fs import resolve_project_path


def _write_openkms_config(skill_dest: Path) -> None:
    cfg = {"api_base_url": settings.openkms_backend_url.rstrip("/")}
    (skill_dest / "config.yml").write_text(
        yaml.safe_dump(cfg, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )


def _pip_install_requirements(skill_dest: Path) -> None:
    req = skill_dest / "requirements.txt"
    if not req.is_file():
        return
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "-q", "-r", str(req)],
        check=False,
        timeout=120,
        capture_output=True,
    )


async def install_skill_to_project(
    db: AsyncSession,
    project: Project,
    skill_id: str,
    *,
    version: str | None,
    installed_by: str | None,
    installed_by_name: str | None,
) -> dict[str, Any]:
    skill = await db.get(AgentSkill, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    ver_str = await resolve_version_for_skill(db, skill, version)
    r = await db.execute(
        select(AgentSkillVersion).where(
            AgentSkillVersion.skill_id == skill_id,
            AgentSkillVersion.version == ver_str,
        )
    )
    ver_row = r.scalar_one_or_none()
    if not ver_row:
        raise HTTPException(status_code=404, detail="Skill version not found")

    src = version_dir(skill_id, ver_str)
    if not src.is_dir():
        raise HTTPException(status_code=404, detail="Skill version files missing on disk")

    dest = resolve_project_path(project.id, f".openkms/skills/{skill_id}")
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(src, dest)
    if skill_id == "openkms":
        _write_openkms_config(dest)
    _pip_install_requirements(dest)

    settings_json = dict(project.settings or {})
    installed = dict(settings_json.get("installed_skills") or {})
    installed[skill_id] = {
        "version": ver_str,
        "content_hash": ver_row.content_hash,
        "installed_at": datetime.now(timezone.utc).isoformat(),
        "installed_by": installed_by,
        "installed_by_name": installed_by_name,
    }
    settings_json["installed_skills"] = installed
    project.settings = settings_json
    await db.flush()
    return installed[skill_id]


async def uninstall_skill_from_project(db: AsyncSession, project: Project, skill_id: str) -> None:
    dest = resolve_project_path(project.id, f".openkms/skills/{skill_id}")
    if dest.exists():
        shutil.rmtree(dest)
    settings_json = dict(project.settings or {})
    installed = dict(settings_json.get("installed_skills") or {})
    installed.pop(skill_id, None)
    settings_json["installed_skills"] = installed
    project.settings = settings_json
    await db.flush()
