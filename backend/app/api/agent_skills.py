"""Global agent skills registry API."""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.auth import require_permission
from app.database import get_db
from app.models.agent_skill import AgentSkill, AgentSkillVersion
from app.models.project import Project
from app.schemas.agent_skill import (
    AgentSkillOut,
    AgentSkillPatch,
    AgentSkillVersionOut,
)
from app.services.agent.agent_skill_hash import compute_content_hash
from app.services.agent.agent_skills_registry import (
    extract_folder_upload,
    extract_zip_upload,
    skill_dir,
    validate_skill_id,
    version_dir,
)
from app.services.feature_toggles import require_agents_feature
from app.services.permissions.permission_catalog import PERM_PROJECTS_READ, PERM_PROJECTS_WRITE

router = APIRouter(
    prefix="/agent-skills",
    tags=["agent-skills"],
    dependencies=[Depends(require_agents_feature)],
)


def _creator_from_request(request: Request) -> tuple[str | None, str | None]:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    uname = p.get("preferred_username") or p.get("name")
    created_by = sub if isinstance(sub, str) and sub.strip() else None
    created_by_name = str(uname)[:256] if isinstance(uname, str) and uname.strip() else None
    return created_by, created_by_name


def _skill_to_out(skill: AgentSkill) -> AgentSkillOut:
    return AgentSkillOut(
        id=skill.id,
        display_name=skill.display_name,
        created_by=skill.created_by,
        created_by_name=skill.created_by_name,
        is_default=skill.is_default,
        default_version=skill.default_version,
        created_at=skill.created_at,
        versions=[
            AgentSkillVersionOut(
                id=v.id,
                version=v.version,
                uploaded_by=v.uploaded_by,
                uploaded_by_name=v.uploaded_by_name,
                content_hash=v.content_hash,
                notes=v.notes,
                created_at=v.created_at,
            )
            for v in (skill.versions or [])
        ],
    )


@router.get("", response_model=list[AgentSkillOut], dependencies=[Depends(require_permission(PERM_PROJECTS_READ))])
async def list_agent_skills(request: Request, db: AsyncSession = Depends(get_db)):
    r = await db.execute(
        select(AgentSkill).options(selectinload(AgentSkill.versions)).order_by(AgentSkill.id.asc())
    )
    return [_skill_to_out(s) for s in r.scalars().all()]


@router.get("/{skill_id}", response_model=AgentSkillOut, dependencies=[Depends(require_permission(PERM_PROJECTS_READ))])
async def get_agent_skill(skill_id: str, db: AsyncSession = Depends(get_db)):
    skill = await db.get(AgentSkill, skill_id, options=[selectinload(AgentSkill.versions)])
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return _skill_to_out(skill)


@router.post("", response_model=AgentSkillOut, status_code=201, dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))])
async def upload_agent_skill(
    request: Request,
    db: AsyncSession = Depends(get_db),
    skill_id: str = Form(...),
    version: str = Form(...),
    display_name: str | None = Form(None),
    notes: str | None = Form(None),
    archive: UploadFile | None = File(None),
    files: list[UploadFile] | None = File(None),
    relative_paths: list[str] | None = Form(None),
):
    sid = validate_skill_id(skill_id)
    ver = (version or "").strip()
    if not ver:
        raise HTTPException(status_code=400, detail="version is required")

    created_by, created_by_name = _creator_from_request(request)
    staging = Path(tempfile.mkdtemp(prefix="skill-upload-"))
    try:
        if archive is not None and archive.filename:
            await extract_zip_upload(archive, staging)
        elif files:
            paths = relative_paths or [f.filename or "" for f in files]
            await extract_folder_upload(files, paths, staging)
        else:
            raise HTTPException(status_code=400, detail="Provide archive (zip) or files[]")

        from app.services.agent.agent_skills_registry import validate_skill_tree

        validate_skill_tree(staging)
        content_hash = compute_content_hash(staging)

        existing_ver = await db.execute(
            select(AgentSkillVersion).where(
                AgentSkillVersion.skill_id == sid,
                AgentSkillVersion.version == ver,
            )
        )
        prev = existing_ver.scalar_one_or_none()
        if prev is not None:
            if prev.content_hash == content_hash:
                skill = await db.get(AgentSkill, sid, options=[selectinload(AgentSkill.versions)])
                if skill is None:
                    raise HTTPException(status_code=500, detail="Skill row missing")
                return _skill_to_out(skill)
            raise HTTPException(status_code=409, detail="Version already exists with different content")

        skill = await db.get(AgentSkill, sid)
        if skill is None:
            skill = AgentSkill(
                id=sid,
                display_name=(display_name or sid).strip()[:256],
                created_by=created_by,
                created_by_name=created_by_name,
            )
            db.add(skill)
        elif display_name and display_name.strip():
            skill.display_name = display_name.strip()[:256]

        dest = version_dir(sid, ver)
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(staging, dest)

        row = AgentSkillVersion(
            skill_id=sid,
            version=ver,
            uploaded_by=created_by,
            uploaded_by_name=created_by_name,
            content_hash=content_hash,
            notes=(notes or "").strip() or None,
        )
        db.add(row)
        await db.flush()
        await db.refresh(skill, attribute_names=["versions"])
        r = await db.execute(
            select(AgentSkill).where(AgentSkill.id == sid).options(selectinload(AgentSkill.versions))
        )
        skill = r.scalar_one()
        return _skill_to_out(skill)
    finally:
        shutil.rmtree(staging, ignore_errors=True)


@router.patch("/{skill_id}", response_model=AgentSkillOut, dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))])
async def patch_agent_skill(
    skill_id: str,
    body: AgentSkillPatch,
    db: AsyncSession = Depends(get_db),
):
    skill = await db.get(AgentSkill, skill_id, options=[selectinload(AgentSkill.versions)])
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    if body.display_name is not None:
        skill.display_name = body.display_name.strip()[:256]
    if body.is_default is not None:
        skill.is_default = body.is_default
    if body.default_version is not None:
        dv = body.default_version.strip() or None
        if dv:
            r = await db.execute(
                select(AgentSkillVersion).where(
                    AgentSkillVersion.skill_id == skill_id,
                    AgentSkillVersion.version == dv,
                )
            )
            if r.scalar_one_or_none() is None:
                raise HTTPException(status_code=400, detail="default_version does not exist")
        skill.default_version = dv
    await db.flush()
    return _skill_to_out(skill)


@router.delete(
    "/{skill_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
)
async def delete_agent_skill(skill_id: str, db: AsyncSession = Depends(get_db)):
    skill = await db.get(AgentSkill, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    pr = await db.execute(select(Project))
    for project in pr.scalars().all():
        installed = (project.settings or {}).get("installed_skills") or {}
        if isinstance(installed, dict) and skill_id in installed:
            raise HTTPException(status_code=409, detail="Skill is installed in a project")

    dest = skill_dir(skill_id)
    if dest.exists():
        shutil.rmtree(dest)
    await db.delete(skill)


@router.delete(
    "/{skill_id}/versions/{version}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
)
async def delete_agent_skill_version(skill_id: str, version: str, db: AsyncSession = Depends(get_db)):
    skill = await db.get(AgentSkill, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    if skill.default_version == version:
        raise HTTPException(status_code=409, detail="Version is the skill default_version")

    r = await db.execute(
        select(AgentSkillVersion).where(
            AgentSkillVersion.skill_id == skill_id,
            AgentSkillVersion.version == version,
        )
    )
    row = r.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Version not found")

    pr = await db.execute(select(Project))
    for project in pr.scalars().all():
        installed = (project.settings or {}).get("installed_skills") or {}
        entry = installed.get(skill_id) if isinstance(installed, dict) else None
        if isinstance(entry, dict) and entry.get("version") == version:
            raise HTTPException(status_code=409, detail="Version is installed in a project")

    dest = version_dir(skill_id, version)
    if dest.exists():
        shutil.rmtree(dest)
    await db.delete(row)
