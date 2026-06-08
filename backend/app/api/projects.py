"""Agent workspace projects API."""

from __future__ import annotations

import shutil
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth, require_permission
from app.database import get_db
from app.models.project import Project
from app.schemas.project import (
    GitCommitRequest,
    GitInitResponse,
    GitLogResponse,
    GitStatusResponse,
    ProjectCreate,
    ProjectFileContentResponse,
    ProjectFileDeleteRequest,
    ProjectFileListResponse,
    ProjectFileWriteRequest,
    ProjectResponse,
    ProjectUpdate,
)
from app.services.deep_agents import git_service
from app.services.feature_toggles import require_agents_feature
from app.services.permission_catalog import PERM_PROJECTS_READ, PERM_PROJECTS_WRITE
from app.services.project_fs import (
    delete_path,
    list_dir,
    make_slug,
    project_root,
    read_file,
    scaffold_project_dir,
    write_file,
)
from app.services.project_fs import upload_file as fs_upload

router = APIRouter(
    prefix="/projects",
    tags=["projects"],
    dependencies=[Depends(require_agents_feature)],
)


def _get_sub(request: Request) -> str:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not sub.strip():
        raise HTTPException(status_code=401, detail="Not authenticated")
    return sub


def _to_out(p: Project) -> ProjectResponse:
    return ProjectResponse(
        id=p.id,
        user_sub=p.user_sub,
        name=p.name,
        description=p.description,
        slug=p.slug,
        settings=p.settings or {},
        git_initialized=p.git_initialized,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


async def _get_owned_project(db: AsyncSession, project_id: str, sub: str) -> Project:
    p = await db.get(Project, project_id)
    if not p or p.user_sub != sub:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


@router.get("", response_model=list[ProjectResponse], dependencies=[Depends(require_permission(PERM_PROJECTS_READ))])
async def list_projects(request: Request, db: AsyncSession = Depends(get_db)):
    sub = _get_sub(request)
    r = await db.execute(
        select(Project).where(Project.user_sub == sub).order_by(Project.updated_at.desc())
    )
    return [_to_out(p) for p in r.scalars().all()]


@router.post("", response_model=ProjectResponse, status_code=201, dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))])
async def create_project(request: Request, body: ProjectCreate, db: AsyncSession = Depends(get_db)):
    sub = _get_sub(request)
    r = await db.execute(select(Project.slug).where(Project.user_sub == sub))
    existing = {row[0] for row in r.all()}
    slug = body.slug.strip() if body.slug else make_slug(body.name, existing)
    if slug in existing:
        raise HTTPException(status_code=409, detail="Slug already in use")
    p = Project(
        user_sub=sub,
        name=body.name.strip(),
        description=body.description,
        slug=slug,
        settings={},
    )
    db.add(p)
    await db.flush()
    scaffold_project_dir(p.id)
    await db.refresh(p)
    return _to_out(p)


@router.get("/{project_id}", response_model=ProjectResponse, dependencies=[Depends(require_permission(PERM_PROJECTS_READ))])
async def get_project(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    sub = _get_sub(request)
    return _to_out(await _get_owned_project(db, project_id, sub))


@router.patch("/{project_id}", response_model=ProjectResponse, dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))])
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    sub = _get_sub(request)
    p = await _get_owned_project(db, project_id, sub)
    if body.name is not None:
        p.name = body.name.strip()
    if body.description is not None:
        p.description = body.description
    if body.slug is not None:
        new_slug = body.slug.strip()
        r = await db.execute(
            select(Project).where(Project.user_sub == sub, Project.slug == new_slug, Project.id != project_id)
        )
        if r.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Slug already in use")
        p.slug = new_slug
    if body.settings is not None:
        p.settings = body.settings
    await db.flush()
    await db.refresh(p)
    return _to_out(p)


@router.delete("/{project_id}", status_code=204, dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))])
async def delete_project(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    sub = _get_sub(request)
    p = await _get_owned_project(db, project_id, sub)
    root = project_root(project_id)
    if root.exists():
        shutil.rmtree(root, ignore_errors=True)
    await db.delete(p)
    await db.flush()


@router.get(
    "/{project_id}/files",
    response_model=ProjectFileListResponse,
    dependencies=[Depends(require_permission(PERM_PROJECTS_READ))],
)
async def list_files(
    project_id: str,
    request: Request,
    path: str = Query(default=""),
    db: AsyncSession = Depends(get_db),
):
    sub = _get_sub(request)
    await _get_owned_project(db, project_id, sub)
    entries = list_dir(project_id, path)
    return ProjectFileListResponse(path=path, entries=entries)


@router.get(
    "/{project_id}/files/content",
    response_model=ProjectFileContentResponse,
    dependencies=[Depends(require_permission(PERM_PROJECTS_READ))],
)
async def get_file_content(
    project_id: str,
    request: Request,
    path: str = Query(min_length=1),
    db: AsyncSession = Depends(get_db),
):
    sub = _get_sub(request)
    await _get_owned_project(db, project_id, sub)
    data = read_file(project_id, path)
    return ProjectFileContentResponse(**data)


@router.put(
    "/{project_id}/files/content",
    dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
)
async def put_file_content(
    project_id: str,
    body: ProjectFileWriteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    sub = _get_sub(request)
    await _get_owned_project(db, project_id, sub)
    write_file(project_id, body.path, body.content)
    return {"ok": True, "path": body.path}


@router.post(
    "/{project_id}/files/upload",
    dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
)
async def upload_project_file(
    project_id: str,
    request: Request,
    file: UploadFile = File(...),
    path: str = Query(default=""),
    db: AsyncSession = Depends(get_db),
):
    sub = _get_sub(request)
    await _get_owned_project(db, project_id, sub)
    saved = await fs_upload(project_id, path, file)
    return {"path": saved}


@router.delete(
    "/{project_id}/files",
    dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
)
async def delete_project_file(
    project_id: str,
    body: ProjectFileDeleteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    sub = _get_sub(request)
    await _get_owned_project(db, project_id, sub)
    delete_path(project_id, body.path)
    return {"ok": True}


@router.get(
    "/{project_id}/settings",
    dependencies=[Depends(require_permission(PERM_PROJECTS_READ))],
)
async def get_settings(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    sub = _get_sub(request)
    p = await _get_owned_project(db, project_id, sub)
    return p.settings or {}


@router.patch(
    "/{project_id}/settings",
    dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
)
async def patch_settings(
    project_id: str,
    body: dict[str, Any],
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    sub = _get_sub(request)
    p = await _get_owned_project(db, project_id, sub)
    merged = {**(p.settings or {}), **body}
    p.settings = merged
    await db.flush()
    return merged


@router.post(
    "/{project_id}/git/init",
    response_model=GitInitResponse,
    dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
)
async def git_init(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    sub = _get_sub(request)
    p = await _get_owned_project(db, project_id, sub)
    git_service.git_init(project_id, p.settings or {})
    p.git_initialized = True
    await db.flush()
    return GitInitResponse(git_initialized=True)


@router.get(
    "/{project_id}/git/status",
    response_model=GitStatusResponse,
    dependencies=[Depends(require_permission(PERM_PROJECTS_READ))],
)
async def git_status(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    sub = _get_sub(request)
    await _get_owned_project(db, project_id, sub)
    data = git_service.git_status(project_id)
    return GitStatusResponse(**data)


@router.get(
    "/{project_id}/git/log",
    response_model=GitLogResponse,
    dependencies=[Depends(require_permission(PERM_PROJECTS_READ))],
)
async def git_log(
    project_id: str,
    request: Request,
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    sub = _get_sub(request)
    await _get_owned_project(db, project_id, sub)
    return GitLogResponse(entries=git_service.git_log(project_id, limit=limit))


@router.post(
    "/{project_id}/git/commit",
    dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
)
async def git_commit(
    project_id: str,
    body: GitCommitRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    sub = _get_sub(request)
    p = await _get_owned_project(db, project_id, sub)
    if body.paths:
        git_service.git_add(project_id, body.paths)
    else:
        git_service.git_add(project_id, None)
    out = git_service.git_commit(project_id, body.message, p.settings or {})
    return {"ok": True, "output": out}


# Nested conversation routes
from app.api.project_conversations import router as project_conversations_router  # noqa: E402

router.include_router(project_conversations_router)

# Remote git (Phase 6)
from app.api.project_git_remote import router as project_git_remote_router  # noqa: E402

router.include_router(project_git_remote_router)
