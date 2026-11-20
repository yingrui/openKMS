"""Workforce skills — the registry digital employees install instruction packages from.

Separate from Agent Project's skill registry (`agent_skills`) on purpose: a workforce skill is
authored and published in the product, and its versions have a lifecycle (draft → published →
deprecated) that an uploaded archive does not. The two tables never reference each other.

Editing is last-write-wins: a draft is a scratchpad, not a shared document.
See `docs/features/workforce.md`.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.api.workforce import _principal
from app.database import get_db
from app.models.workforce_skill import (
    SKILL_VERSION_DEPRECATED,
    SKILL_VERSION_DRAFT,
    SKILL_VERSION_PUBLISHED,
    WorkforceSkill,
    WorkforceSkillVersion,
)
from app.schemas.workforce_skills import (
    WorkforceSkillCreate,
    WorkforceSkillDetail,
    WorkforceSkillFileDelete,
    WorkforceSkillFileWrite,
    WorkforceSkillListItem,
    WorkforceSkillListResponse,
    WorkforceSkillVersionOut,
)
from app.services.workforce.skill_package import (
    SKILL_FILE,
    analyse,
    content_hash,
    size_bytes,
)

router = APIRouter(
    prefix="/workforce/skills",
    tags=["workforce-skills"],
    dependencies=[Depends(require_auth)],
)

_SKILL_ID_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")

#: The blank page a new skill opens on. Written out in full because an empty editor showing an empty
#: textarea teaches nothing about what a skill needs.
_TEMPLATE = """---
name: {skill_id}
description: 一句话说明这个技能做什么、什么时候用它。
---

## 何时使用

## 怎么做

## 不要做什么
"""


def _validate_id(skill_id: str) -> str:
    sid = (skill_id or "").strip().lower()
    if not sid or not _SKILL_ID_RE.match(sid) or len(sid) > 64:
        raise HTTPException(
            status_code=400,
            detail="Skill id must be lowercase letters, digits and hyphens / 技能 ID 只能用小写字母、数字和连字符",
        )
    return sid


async def _skill(db: AsyncSession, skill_id: str) -> WorkforceSkill:
    skill = await db.get(WorkforceSkill, skill_id)
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    return skill


async def _draft(db: AsyncSession, skill_id: str) -> WorkforceSkillVersion | None:
    return (
        await db.execute(
            select(WorkforceSkillVersion).where(
                WorkforceSkillVersion.skill_id == skill_id,
                WorkforceSkillVersion.status == SKILL_VERSION_DRAFT,
            )
        )
    ).scalars().first()


async def _latest_published(db: AsyncSession, skill_id: str) -> WorkforceSkillVersion | None:
    rows = (
        await db.execute(
            select(WorkforceSkillVersion)
            .where(
                WorkforceSkillVersion.skill_id == skill_id,
                WorkforceSkillVersion.status.in_(
                    (SKILL_VERSION_PUBLISHED, SKILL_VERSION_DEPRECATED)
                ),
            )
            .order_by(WorkforceSkillVersion.version.desc())
        )
    ).scalars().all()
    return rows[0] if rows else None


def _next_version(latest: WorkforceSkillVersion | None) -> str:
    try:
        return str(int(latest.version) + 1) if latest else "1"
    except (TypeError, ValueError):
        return "1"


async def _ensure_draft(db: AsyncSession, skill: WorkforceSkill) -> WorkforceSkillVersion:
    """Open a draft if there is none, continuing from the newest release.

    Cloning the release matters: an author expects to see what they last shipped and change one
    paragraph, not to start from an empty file.
    """
    draft = await _draft(db, skill.id)
    if draft is not None:
        return draft
    latest = await _latest_published(db, skill.id)
    draft = WorkforceSkillVersion(
        skill_id=skill.id,
        version=_next_version(latest),
        status=SKILL_VERSION_DRAFT,
        files=dict(latest.files or {}) if latest else {SKILL_FILE: _TEMPLATE.format(skill_id=skill.id)},
        entrypoint=latest.entrypoint if latest else None,
        subcommands=list(latest.subcommands or []) if latest else [],
        size_bytes=latest.size_bytes if latest else 0,
    )
    db.add(draft)
    await db.flush()
    return draft


def _versions_out(versions: list[WorkforceSkillVersion]) -> list[WorkforceSkillVersionOut]:
    return [
        WorkforceSkillVersionOut(
            version=v.version,
            status=v.status,
            size_bytes=v.size_bytes,
            content_hash=v.content_hash,
            entrypoint=v.entrypoint,
            subcommands=list(v.subcommands or []),
            published_at=v.published_at,
            published_by_name=v.published_by_name,
        )
        for v in sorted(versions, key=lambda row: _version_sort(row.version), reverse=True)
    ]


def _version_sort(version: str) -> tuple[int, str]:
    try:
        return (0, f"{int(version):020d}")
    except (TypeError, ValueError):
        return (1, version)


async def _detail(db: AsyncSession, skill: WorkforceSkill) -> WorkforceSkillDetail:
    draft = await _draft(db, skill.id)
    latest = await _latest_published(db, skill.id)
    versions = (
        await db.execute(
            select(WorkforceSkillVersion)
            .where(
                WorkforceSkillVersion.skill_id == skill.id,
                WorkforceSkillVersion.status != SKILL_VERSION_DRAFT,
            )
            .order_by(WorkforceSkillVersion.created_at.desc())  # newest first; version sort below
        )
    ).scalars().all()
    working = draft or latest
    files = dict(working.files or {}) if working is not None else {}
    report = analyse(files, skill_id=skill.id)
    return WorkforceSkillDetail(
        id=skill.id,
        name=skill.name,
        description=skill.description,
        has_draft=draft is not None,
        draft_version=draft.version if draft is not None else _next_version(latest),
        files=files,
        entrypoint=(report.frontmatter.entrypoint if report.frontmatter else None),
        subcommands=list(report.frontmatter.subcommands) if report.frontmatter else [],
        blocking=list(report.blocking),
        warnings=list(report.warnings),
        versions=_versions_out(list(versions)),
        updated_at=skill.updated_at,
    )


@router.get("", response_model=WorkforceSkillListResponse)
async def list_skills(request: Request, db: AsyncSession = Depends(get_db)):
    """Every skill in the registry, with its newest release and whether a draft is open."""
    _principal(request)
    skills = (
        await db.execute(select(WorkforceSkill).order_by(WorkforceSkill.name))
    ).scalars().all()
    items: list[WorkforceSkillListItem] = []
    for skill in skills:
        latest = await _latest_published(db, skill.id)
        draft = await _draft(db, skill.id)
        items.append(
            WorkforceSkillListItem(
                id=skill.id,
                name=skill.name,
                description=skill.description,
                latest_version=latest.version if latest is not None else None,
                latest_status=latest.status if latest is not None else None,
                has_draft=draft is not None,
                updated_at=skill.updated_at,
            )
        )
    return WorkforceSkillListResponse(items=items)


@router.post("", response_model=WorkforceSkillDetail, status_code=201)
async def create_skill(
    body: WorkforceSkillCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    sub, name = _principal(request)
    skill_id = _validate_id(body.id)
    if await db.get(WorkforceSkill, skill_id) is not None:
        raise HTTPException(status_code=409, detail="Skill id already exists")
    skill = WorkforceSkill(
        id=skill_id,
        name=(body.name or skill_id).strip()[:256],
        description=(body.description or "").strip() or None,
        created_by=sub,
        created_by_name=name,
    )
    db.add(skill)
    await db.flush()
    await _ensure_draft(db, skill)
    await db.commit()
    await db.refresh(skill)
    return await _detail(db, skill)


@router.get("/{skill_id}", response_model=WorkforceSkillDetail)
async def get_skill(skill_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    _principal(request)
    return await _detail(db, await _skill(db, skill_id))


@router.put("/{skill_id}/draft/file", response_model=WorkforceSkillDetail)
async def write_draft_file(
    skill_id: str,
    body: WorkforceSkillFileWrite,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Save one file of the draft. Last write wins — there is no lock to lose."""
    _principal(request)
    skill = await _skill(db, skill_id)
    draft = await _ensure_draft(db, skill)
    files = dict(draft.files or {})
    files[body.path] = body.content
    draft.files = files
    draft.size_bytes = size_bytes(files)
    await db.commit()
    await db.refresh(skill)
    return await _detail(db, skill)


@router.delete("/{skill_id}/draft/file", response_model=WorkforceSkillDetail)
async def delete_draft_file(
    skill_id: str,
    body: WorkforceSkillFileDelete,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    _principal(request)
    skill = await _skill(db, skill_id)
    draft = await _ensure_draft(db, skill)
    files = dict(draft.files or {})
    if body.path not in files:
        raise HTTPException(status_code=404, detail="File not found in draft")
    if body.path == SKILL_FILE:
        raise HTTPException(status_code=400, detail="SKILL.md cannot be deleted")
    del files[body.path]
    draft.files = files
    draft.size_bytes = size_bytes(files)
    await db.commit()
    await db.refresh(skill)
    return await _detail(db, skill)


@router.post("/{skill_id}/publish", response_model=WorkforceSkillDetail)
async def publish_skill(skill_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Freeze the draft into an immutable version. Refuses anything `analyse` calls blocking."""
    sub, name = _principal(request)
    skill = await _skill(db, skill_id)
    draft = await _draft(db, skill.id)
    if draft is None:
        raise HTTPException(status_code=400, detail="没有待发布的草稿 / there is no draft to publish")
    files = dict(draft.files or {})
    report = analyse(files, skill_id=skill.id)
    if not report.ok:
        raise HTTPException(status_code=400, detail="；".join(report.blocking))

    frontmatter = report.frontmatter
    draft.status = SKILL_VERSION_PUBLISHED
    draft.entrypoint = frontmatter.entrypoint if frontmatter else None
    draft.subcommands = list(frontmatter.subcommands) if frontmatter else []
    draft.content_hash = content_hash(files)
    draft.size_bytes = size_bytes(files)
    draft.published_at = datetime.now(timezone.utc)
    draft.published_by = sub
    draft.published_by_name = name
    skill.description = frontmatter.description if frontmatter else skill.description
    await db.commit()
    await db.refresh(skill)
    return await _detail(db, skill)


@router.post("/{skill_id}/versions/{version}/deprecate", response_model=WorkforceSkillDetail)
async def deprecate_version(
    skill_id: str,
    version: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Retire a release.

    Agents that installed it keep working and are not told: their answers do not change, and a
    notice that says "your skill is retired" without saying what to do about it is noise.
    """
    _principal(request)
    skill = await _skill(db, skill_id)
    row = (
        await db.execute(
            select(WorkforceSkillVersion).where(
                WorkforceSkillVersion.skill_id == skill.id,
                WorkforceSkillVersion.version == version,
                WorkforceSkillVersion.status == SKILL_VERSION_PUBLISHED,
            )
        )
    ).scalars().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Published version not found")
    row.status = SKILL_VERSION_DEPRECATED
    await db.commit()
    await db.refresh(skill)
    return await _detail(db, skill)


@router.get("/{skill_id}/available", response_model=list[WorkforceSkillVersionOut])
async def list_installable_versions(
    skill_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """Versions an agent may install: published only. Deprecated releases are history."""
    _principal(request)
    await _skill(db, skill_id)
    rows = (
        await db.execute(
            select(WorkforceSkillVersion)
            .where(
                WorkforceSkillVersion.skill_id == skill_id,
                WorkforceSkillVersion.status == SKILL_VERSION_PUBLISHED,
            )
            .order_by(WorkforceSkillVersion.created_at.desc())  # newest first; version sort below
        )
    ).scalars().all()
    return _versions_out(list(rows))
