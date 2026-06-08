"""Remote git operations (HTTPS + PAT) for projects."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_jwt_sub
from app.api.auth import require_permission
from app.database import get_db
from app.models.project import Project
from app.models.user_git_credential import UserGitCredential
from app.schemas.project import GitCloneRequest, GitRemoteRequest
from app.services.deep_agents import git_service
from app.services.permission_catalog import PERM_PROJECTS_WRITE

router = APIRouter()


async def _get_project(db: AsyncSession, project_id: str, sub: str) -> Project:
    p = await db.get(Project, project_id)
    if not p or p.user_sub != sub:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


async def _resolve_credential(
    db: AsyncSession, sub: str, credential_id: str | None
) -> tuple[str, str]:
    if not credential_id:
        raise HTTPException(status_code=400, detail="credential_id is required for remote git")
    row = await db.get(UserGitCredential, credential_id)
    if not row or row.user_sub != sub:
        raise HTTPException(status_code=404, detail="Git credential not found")
    token = git_service.decrypt_pat(row.encrypted_pat)
    return row.username, token


@router.post(
    "/{project_id}/git/clone",
    dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
)
async def git_clone(
    project_id: str,
    body: GitCloneRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    sub = get_jwt_sub(request)
    p = await _get_project(db, project_id, sub)
    username, token = await _resolve_credential(db, sub, body.credential_id)
    git_service.git_clone_into_project(project_id, body.url, username=username, token=token)
    p.git_initialized = True
    await db.flush()
    return {"ok": True}


@router.post(
    "/{project_id}/git/remote",
    dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
)
async def git_remote(
    project_id: str,
    body: GitRemoteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    sub = get_jwt_sub(request)
    await _get_project(db, project_id, sub)
    if not body.url.startswith("https://"):
        raise HTTPException(status_code=400, detail="Only HTTPS remotes are supported")
    git_service.git_remote_add(project_id, body.url)
    return {"ok": True}


@router.post(
    "/{project_id}/git/pull",
    dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
)
async def git_pull(
    project_id: str,
    body: GitRemoteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    sub = get_jwt_sub(request)
    await _get_project(db, project_id, sub)
    username, token = await _resolve_credential(db, sub, body.credential_id)
    out = git_service.git_pull(project_id, username, token)
    return {"ok": True, "output": out}


@router.post(
    "/{project_id}/git/push",
    dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
)
async def git_push(
    project_id: str,
    body: GitRemoteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    sub = get_jwt_sub(request)
    await _get_project(db, project_id, sub)
    username, token = await _resolve_credential(db, sub, body.credential_id)
    out = git_service.git_push(project_id, username, token)
    return {"ok": True, "output": out}
