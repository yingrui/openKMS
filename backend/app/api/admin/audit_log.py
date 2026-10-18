"""The audit log — what changed, by whom, and whether it worked.

Read-only: nothing here writes. It answers the question that matters minutes after a mistake ("what did
the agent touch?") and the one that matters days later ("who changed this dataset?").
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth, require_permission
from app.database import get_db
from app.models.audit_event import AuditEvent
from app.schemas.audit import AuditEventResponse, AuditEventListResponse
from app.services.permissions.permission_catalog import PERM_CONSOLE_PERMISSIONS

router = APIRouter(
    prefix="/console/audit-events",
    tags=["console"],
    dependencies=[Depends(require_auth), Depends(require_permission(PERM_CONSOLE_PERMISSIONS))],
)


@router.get("", response_model=AuditEventListResponse)
async def list_audit_events(
    actor_sub: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    method: str | None = None,
    path: str | None = Query(None, description="substring match"),
    since: datetime | None = None,
    before: str | None = Query(None, description="keyset cursor: the `at` of the last row you have"),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Newest first. Every filter narrows; nothing is required."""
    stmt = select(AuditEvent)
    if actor_sub:
        stmt = stmt.where(AuditEvent.actor_sub == actor_sub)
    if resource_type:
        stmt = stmt.where(AuditEvent.resource_type == resource_type)
    if resource_id:
        stmt = stmt.where(AuditEvent.resource_id == resource_id)
    if method:
        stmt = stmt.where(AuditEvent.method == method.upper())
    if path:
        stmt = stmt.where(AuditEvent.path.ilike(f"%{path}%"))
    if since:
        stmt = stmt.where(AuditEvent.at >= since)
    if before:
        stmt = stmt.where(AuditEvent.at < before)

    rows = (
        await db.execute(stmt.order_by(AuditEvent.at.desc(), AuditEvent.id.desc()).limit(limit))
    ).scalars().all()
    return AuditEventListResponse(
        items=[AuditEventResponse.model_validate(row, from_attributes=True) for row in rows],
        total=len(rows),
    )
