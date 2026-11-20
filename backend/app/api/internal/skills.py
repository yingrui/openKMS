"""Internal skill-package text, for services that put skills into a prompt.

Two registries, and the caller names which one it means:

* `agent` — Agent Project packages (`agent_skills`), stored as directories on disk, uploaded as zip files;
* `workforce` — workforce skills (`workforce_skill_versions`), authored in the product, stored as rows.

They are separate assets with separate lifecycles, so a bare skill id would be ambiguous: the same slug can exist in
both. The qa-agent needs the text, not the tree, and it must not read either storage itself.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_internal_client
from app.database import get_db
from app.models.agent_skill import AgentSkill, AgentSkillVersion
from app.models.workforce_skill import SKILL_VERSION_DRAFT, WorkforceSkill, WorkforceSkillVersion
from app.services.runtime.agent.agent_skills_registry import version_dir
from app.services.workforce.skill_package import SKILL_FILE

router = APIRouter(
    prefix="/internal-api/skills",
    tags=["internal-skills"],
    dependencies=[Depends(require_internal_client)],
)

#: A package's `SKILL.md` is instructions, not a document; anything larger is a mistake, not a skill.
MAX_SKILL_CHARS = 40_000


#: A registry the caller may name. `agent` is Agent Project's; `workforce` is the digital employees'.
REGISTRIES = ("agent", "workforce")


@router.get("/{registry}/{skill_id}/{version}/prompt")
async def skill_prompt(registry: str, skill_id: str, version: str, db: AsyncSession = Depends(get_db)):
    """The `SKILL.md` text of one skill version, plus its display name."""
    if registry not in REGISTRIES:
        raise HTTPException(status_code=404, detail="Unknown skill registry")
    if registry == "workforce":
        return await _workforce_skill_prompt(db, skill_id, version)
    return await _agent_skill_prompt(db, skill_id, version)


async def _agent_skill_prompt(db: AsyncSession, skill_id: str, version: str) -> dict:
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
    return _prompt_payload(skill_id, skill.display_name, version, body)


async def _workforce_skill_prompt(db: AsyncSession, skill_id: str, version: str) -> dict:
    skill = await db.get(WorkforceSkill, skill_id)
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    row = (
        await db.execute(
            select(WorkforceSkillVersion).where(
                WorkforceSkillVersion.skill_id == skill_id,
                WorkforceSkillVersion.version == version,
                # A draft is not installed by anyone; only a release has text to serve.
                WorkforceSkillVersion.status != SKILL_VERSION_DRAFT,
            )
        )
    ).scalars().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Skill version not found")
    body = str((row.files or {}).get(SKILL_FILE) or "")
    if not body:
        raise HTTPException(status_code=404, detail="SKILL.md is missing from this version")
    return _prompt_payload(skill_id, skill.name, version, body)


def _prompt_payload(skill_id: str, display_name: str, version: str, body: str) -> dict:
    return {
        "skill_id": skill_id,
        "display_name": display_name,
        "version": version,
        "content": body[:MAX_SKILL_CHARS],
        "truncated": len(body) > MAX_SKILL_CHARS,
    }
