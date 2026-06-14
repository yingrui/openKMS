"""Job visibility — resolve procrastinate job args to document or KB ACL."""

from __future__ import annotations

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.connector import Connector
from app.models.project import Project
from app.models.scheduled_trigger import PROJECT_AGENT_SCHEDULE_KINDS, ScheduledTrigger
from app.services.document_scope import load_document_scoped
from app.services.kb_scope import load_knowledge_base_scoped
from app.services.permission_catalog import (
    PERM_ALL,
    PERM_CONNECTORS_READ,
    PERM_CONNECTORS_WRITE,
    PERM_PROJECTS_READ,
    PERM_PROJECTS_WRITE,
)
from app.services.resource_acl_constants import PERM_READ, PERM_WRITE
from app.services.resource_acl_service import scope_applies
from app.services.permission_resolution import resolve_oidc_permission_keys, resolve_user_permission_keys

__all__ = ["job_args_allowed", "require_job_args_access"]


async def _resolved_permissions(request: Request, db: AsyncSession) -> set[str]:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str):
        return set()
    if settings.auth_mode == "local":
        return await resolve_user_permission_keys(db, sub)
    return await resolve_oidc_permission_keys(db, p)


async def _connector_job_visible(
    request: Request,
    db: AsyncSession,
    connector_id: str,
    *,
    require_write: bool,
) -> bool:
    perms = await _resolved_permissions(request, db)
    if PERM_ALL in perms:
        return await db.get(Connector, connector_id) is not None
    needed = PERM_CONNECTORS_WRITE if require_write else PERM_CONNECTORS_READ
    alt = PERM_CONNECTORS_WRITE if needed == PERM_CONNECTORS_READ else PERM_CONNECTORS_READ
    if needed not in perms and alt not in perms:
        return False
    return await db.get(Connector, connector_id) is not None


async def _project_id_from_scheduled_agent_args(db: AsyncSession, args: dict) -> str | None:
    project_id = args.get("project_id")
    if isinstance(project_id, str) and project_id.strip():
        return project_id.strip()
    trigger_id = args.get("trigger_id")
    if not isinstance(trigger_id, str) or not trigger_id.strip():
        return None
    trigger = await db.get(ScheduledTrigger, trigger_id.strip())
    if not trigger or trigger.kind not in PROJECT_AGENT_SCHEDULE_KINDS:
        return None
    cfg = trigger.config if isinstance(trigger.config, dict) else {}
    pid = cfg.get("project_id")
    return str(pid).strip() if pid else None


async def _scheduled_agent_job_visible(
    request: Request,
    db: AsyncSession,
    args: dict,
    *,
    require_write: bool,
) -> bool:
    project_id = await _project_id_from_scheduled_agent_args(db, args)
    if not project_id:
        return False
    perms = await _resolved_permissions(request, db)
    if PERM_ALL in perms:
        return await db.get(Project, project_id) is not None
    needed = PERM_PROJECTS_WRITE if require_write else PERM_PROJECTS_READ
    alt = PERM_PROJECTS_WRITE if needed == PERM_PROJECTS_READ else PERM_PROJECTS_READ
    if needed not in perms and alt not in perms:
        return False
    p = await db.get(Project, project_id)
    if not p:
        return False
    sub = request.state.openkms_jwt_payload.get("sub")
    if not isinstance(sub, str):
        return False
    return p.user_sub == sub


async def job_args_allowed(
    request: Request,
    db: AsyncSession,
    args: dict,
    *,
    require_write: bool = False,
) -> bool:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not scope_applies(p, sub):
        return True
    perm = PERM_WRITE if require_write else PERM_READ
    doc_id = args.get("document_id")
    kb_id = args.get("knowledge_base_id")
    connector_id = args.get("connector_id")
    if doc_id and isinstance(doc_id, str):
        try:
            await load_document_scoped(db, request, doc_id, perm)
            return True
        except HTTPException:
            return False
    if kb_id and isinstance(kb_id, str):
        try:
            await load_knowledge_base_scoped(db, request, kb_id, perm)
            return True
        except HTTPException:
            return False
    if connector_id and isinstance(connector_id, str):
        return await _connector_job_visible(request, db, connector_id, require_write=require_write)
    if args.get("trigger_id"):
        return await _scheduled_agent_job_visible(request, db, args, require_write=require_write)
    return False


async def require_job_args_access(
    request: Request,
    db: AsyncSession,
    args: dict,
    *,
    require_write: bool = False,
) -> None:
    if not await job_args_allowed(request, db, args, require_write=require_write):
        raise HTTPException(status_code=404, detail="Job not found")
