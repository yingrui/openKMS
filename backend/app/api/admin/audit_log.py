"""The audit log — what changed, by whom, and whether it worked.

Read-only: nothing here writes. It answers the question that matters minutes after a mistake ("what did
the agent touch?") and the one that matters days later ("who changed this dataset?").
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth, require_permission
from app.database import get_db
from app.models.audit_event import AuditEvent
from app.schemas.audit import (
    AuditEventListResponse,
    AuditEventResponse,
    AuditFacet,
    AuditFacetsResponse,
)
from app.services.permissions.permission_catalog import PERM_CONSOLE_PERMISSIONS

router = APIRouter(
    prefix="/console/audit-events",
    tags=["console"],
    dependencies=[Depends(require_auth), Depends(require_permission(PERM_CONSOLE_PERMISSIONS))],
)


@router.get("/facets", response_model=AuditFacetsResponse)
async def audit_facets(
    since: datetime | None = None,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Counts for the rail, over a window (default 30 days).

    A window, not all time: the log only grows, and a `GROUP BY` over a year of mutations would be a slow
    query on a page that should open instantly. The window is returned so the UI can say what it counted.
    """
    start = since or (datetime.now(timezone.utc) - timedelta(days=days))
    rows = (
        await db.execute(
            select(
                AuditEvent.resource_type,
                AuditEvent.status_code,
                AuditEvent.actor_sub,
                AuditEvent.actor_name,
            ).where(AuditEvent.at >= start)
        )
    ).all()

    resource_types: Counter[str] = Counter()
    statuses: Counter[str] = Counter()
    actors: Counter[str] = Counter()
    actor_labels: dict[str, str] = {}
    for resource_type, status_code, actor_sub, actor_name in rows:
        if resource_type:
            resource_types[resource_type] += 1
        statuses["ok" if status_code < 400 else ("5xx" if status_code >= 500 else "4xx")] += 1
        if actor_sub:
            actors[actor_sub] += 1
            if actor_name and actor_sub not in actor_labels:
                actor_labels[actor_sub] = actor_name

    def facets(counter: Counter[str], labels: dict[str, str] | None = None) -> list[AuditFacet]:
        return sorted(
            (
                AuditFacet(value=value, label=(labels or {}).get(value), count=count)
                for value, count in counter.items()
            ),
            key=lambda facet: (-facet.count, facet.value),
        )

    return AuditFacetsResponse(
        resource_types=facets(resource_types),
        statuses=facets(statuses),
        actors=facets(actors, actor_labels),
        since=start,
    )


@router.get("", response_model=AuditEventListResponse)
async def list_audit_events(
    actor_sub: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    method: str | None = None,
    status: str | None = Query(
        None, description="a group: `ok` (2xx), `4xx`, `5xx`, or `error` (>=400)"
    ),
    path: str | None = Query(None, description="substring match"),
    since: datetime | None = Query(
        None, description="start of the window; defaults to `days` ago, as the rail's counts do"
    ),
    days: int = Query(30, ge=1, le=365),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
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
    if status:
        groups = {
            "ok": AuditEvent.status_code < 400,
            "error": AuditEvent.status_code >= 400,
            "4xx": (AuditEvent.status_code >= 400) & (AuditEvent.status_code < 500),
            "5xx": AuditEvent.status_code >= 500,
        }
        if status not in groups:
            raise HTTPException(status_code=400, detail="status must be one of: ok, 4xx, 5xx, error")
        stmt = stmt.where(groups[status])
    if path:
        stmt = stmt.where(AuditEvent.path.ilike(f"%{path}%"))
    # A window, not all time — the same one the rail counts, so the number in the rail is the number of
    # pages you can turn. An append-only log has no stable offsets, which is why the window matters.
    start = since or (datetime.now(timezone.utc) - timedelta(days=days))
    stmt = stmt.where(AuditEvent.at >= start)

    total = int((await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one())
    rows = (
        await db.execute(
            stmt.order_by(AuditEvent.at.desc(), AuditEvent.id.desc()).offset(offset).limit(limit)
        )
    ).scalars().all()

    items = [AuditEventResponse.model_validate(row, from_attributes=True) for row in rows]
    await _fill_labels(db, items)
    return AuditEventListResponse(items=items, total=total)


async def _fill_labels(db: AsyncSession, items: list[AuditEventResponse]) -> None:
    """Give a subject-less row the name the log learned elsewhere.

    A delete is a 204: no body, so unless its handler volunteered the name, the row has an id and nothing
    else — and the object it points at is gone. The log itself usually knows: a create or a patch of the
    same resource recorded `display_name`/`name`. One query per page fills every such row, for every entity,
    including rows written before the label existed — no handler has to opt in.
    """
    unknown = {item.resource_id for item in items if item.resource_id and not item.resource_label}
    if not unknown:
        return

    rows = (
        await db.execute(
            select(AuditEvent.resource_id, AuditEvent.resource_label)
            .where(AuditEvent.resource_id.in_(unknown), AuditEvent.resource_label.is_not(None))
            .order_by(AuditEvent.at.desc())
        )
    ).all()
    known: dict[str, str] = {}
    for resource_id, label in rows:
        if resource_id and label and resource_id not in known:
            known[resource_id] = label  # newest wins: the name it had when last touched
    for item in items:
        if item.resource_id and not item.resource_label:
            item.resource_label = known.get(item.resource_id)
