"""Internal skill-package text, for services that put skills into a prompt.

A skill is a directory with a `SKILL.md`; the registry stores one directory per version. The qa-agent needs the text,
not the archive, and it must not read the registry's filesystem itself — the registry's layout is the backend's.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_internal_client
from app.database import get_db
from app.models.agent_skill import AgentSkill, AgentSkillVersion
from app.services.runtime.agent.agent_skills_registry import version_dir

router = APIRouter(
    prefix="/internal-api/skills",
    tags=["internal-skills"],
    dependencies=[Depends(require_internal_client)],
)

#: A package's `SKILL.md` is instructions, not a document; anything larger is a mistake, not a skill.
MAX_SKILL_CHARS = 40_000


@router.get("/{skill_id}/{version}/prompt")
async def skill_prompt(skill_id: str, version: str, db: AsyncSession = Depends(get_db)):
    """The `SKILL.md` body of one skill version, plus its display name."""
    skill = await db.get(AgentSkill, skill_id)
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    exists = (
        await db.execute(
            select(AgentSkillVersion.id).where(
                AgentSkillVersion.skill_id == skill_id, AgentSkillVersion.version == version
            )
        )
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=404, detail="Skill version not found")
    path = Path(version_dir(skill_id, version)) / "SKILL.md"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="SKILL.md is missing from this version")
    body = path.read_text(encoding="utf-8", errors="replace")
    return {
        "skill_id": skill_id,
        "display_name": skill.display_name,
        "version": version,
        "content": body[:MAX_SKILL_CHARS],
        "truncated": len(body) > MAX_SKILL_CHARS,
    }
