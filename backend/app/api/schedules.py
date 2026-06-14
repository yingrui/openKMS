"""Central schedules hub API."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth, require_any_permission
from app.database import get_db
from app.models.connector import Connector
from app.models.project import Project
from app.models.scheduled_trigger import (
    PROJECT_AGENT_SCHEDULE_KINDS,
    SCHEDULE_KIND_CONNECTOR_SYNC,
    SCHEDULE_KIND_PROJECT_AGENT_STATEFUL,
    ScheduledTrigger,
)
from app.schemas.schedule import ScheduleListResponse, ScheduleOut, SchedulePatch, ScheduleRunNowResponse
from app.services.connector_catalog import CATEGORY_SYNC, get_kind_spec, normalize_and_validate_settings
from app.services.connector_sync.schedule import compute_next_run_at, validate_cron_expression, validate_timezone
from app.services.permission_catalog import PERM_CONNECTORS_READ, PERM_CONNECTORS_WRITE, PERM_PROJECTS_READ, PERM_PROJECTS_WRITE
from app.services.project_agent_schedule import normalize_agent_schedule_config
from app.services.scheduled_triggers import upsert_connector_sync_trigger

router = APIRouter(
    prefix="/schedules",
    tags=["schedules"],
    dependencies=[Depends(require_auth)],
)


def _agent_fields(row: ScheduledTrigger) -> dict:
    cfg = row.config if isinstance(row.config, dict) else {}
    mode = "stateful" if row.kind == SCHEDULE_KIND_PROJECT_AGENT_STATEFUL else "stateless"
    return {
        "project_id": str(cfg.get("project_id") or "") or None,
        "conversation_id": cfg.get("conversation_id"),
        "mode": mode,
    }


def _to_schedule_out(row: ScheduledTrigger) -> ScheduleOut:
    next_run: object = None
    if row.enabled and row.cron:
        try:
            next_run = compute_next_run_at(row.cron, row.timezone)
        except ValueError:
            next_run = None
    connector_id = row.target_id if row.kind == SCHEDULE_KIND_CONNECTOR_SYNC else None
    agent_extra = _agent_fields(row) if row.kind in PROJECT_AGENT_SCHEDULE_KINDS else {}
    return ScheduleOut(
        id=row.id,
        kind=row.kind,  # type: ignore[arg-type]
        target_id=row.target_id,
        display_name=row.display_name,
        cron=row.cron,
        timezone=row.timezone,
        enabled=row.enabled,
        next_run_at=next_run,
        last_fired_slot=row.last_fired_slot,
        last_run_at=row.last_run_at,
        last_status=row.last_status,
        last_job_id=row.last_job_id,
        connector_id=connector_id,
        project_id=agent_extra.get("project_id"),
        conversation_id=agent_extra.get("conversation_id"),
        mode=agent_extra.get("mode"),
    )


@router.get(
    "",
    response_model=ScheduleListResponse,
    dependencies=[
        Depends(require_any_permission(PERM_CONNECTORS_READ, PERM_CONNECTORS_WRITE, PERM_PROJECTS_READ, PERM_PROJECTS_WRITE))
    ],
)
async def list_schedules(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    total = int(
        (await db.execute(select(func.count()).select_from(ScheduledTrigger))).scalar_one()
    )
    result = await db.execute(
        select(ScheduledTrigger)
        .order_by(ScheduledTrigger.display_name.asc())
        .limit(limit)
        .offset(offset)
    )
    rows = result.scalars().all()
    return ScheduleListResponse(
        items=[_to_schedule_out(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.patch(
    "/{schedule_id}",
    response_model=ScheduleOut,
    dependencies=[Depends(require_any_permission(PERM_CONNECTORS_WRITE, PERM_PROJECTS_WRITE))],
)
async def patch_schedule(schedule_id: str, body: SchedulePatch, db: AsyncSession = Depends(get_db)):
    row = await db.get(ScheduledTrigger, schedule_id)
    if not row:
        raise HTTPException(status_code=404, detail="Schedule not found")

    if body.timezone is not None:
        row.timezone = validate_timezone(body.timezone)
    if body.cron is not None:
        row.cron = validate_cron_expression(body.cron) if body.cron.strip() else None
    if body.enabled is not None:
        row.enabled = body.enabled
        if row.enabled and not row.cron:
            raise HTTPException(status_code=400, detail="cron is required when enabling a schedule")

    if row.kind == SCHEDULE_KIND_CONNECTOR_SYNC:
        connector = await db.get(Connector, row.target_id)
        if not connector:
            raise HTTPException(status_code=400, detail="Connector no longer exists")
        settings = dict(connector.settings or {})
        settings["sync_schedule"] = {
            "enabled": row.enabled,
            "cron": row.cron,
            "timezone": row.timezone,
        }
        try:
            connector.settings = normalize_and_validate_settings(connector.kind, settings)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        try:
            await upsert_connector_sync_trigger(db, connector)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    elif row.kind in PROJECT_AGENT_SCHEDULE_KINDS:
        cfg = dict(row.config) if isinstance(row.config, dict) else {}
        if body.prompt is not None:
            cfg["prompt"] = body.prompt.strip()
        try:
            normalize_agent_schedule_config(cfg)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        row.config = cfg
    else:
        raise HTTPException(status_code=400, detail="Unsupported schedule kind")

    await db.commit()
    await db.refresh(row)
    return _to_schedule_out(row)


@router.post(
    "/{schedule_id}/run-now",
    response_model=ScheduleRunNowResponse,
    status_code=202,
    dependencies=[Depends(require_any_permission(PERM_CONNECTORS_WRITE, PERM_PROJECTS_WRITE))],
)
async def run_schedule_now(schedule_id: str, db: AsyncSession = Depends(get_db)):
    row = await db.get(ScheduledTrigger, schedule_id)
    if not row:
        raise HTTPException(status_code=404, detail="Schedule not found")

    if row.kind == SCHEDULE_KIND_CONNECTOR_SYNC:
        connector = await db.get(Connector, row.target_id)
        if not connector:
            raise HTTPException(status_code=404, detail="Connector not found")
        spec = get_kind_spec(connector.kind)
        if not spec or spec.category != CATEGORY_SYNC:
            raise HTTPException(status_code=400, detail="Connector kind does not support sync")
        if not connector.enabled:
            raise HTTPException(status_code=400, detail="Connector is disabled")
        from app.services.connector_catalog import validate_sync_run_outputs

        try:
            validate_sync_run_outputs(connector.kind, connector.outputs)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    elif row.kind in PROJECT_AGENT_SCHEDULE_KINDS:
        cfg = row.config if isinstance(row.config, dict) else {}
        project_id = str(cfg.get("project_id") or "")
        project = await db.get(Project, project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
    else:
        raise HTTPException(status_code=400, detail="Unsupported schedule kind")

    from app.services.schedule_handlers import defer_scheduled_trigger

    job_id = await defer_scheduled_trigger(row)
    row.last_run_at = datetime.now(timezone.utc)
    row.last_job_id = int(job_id)
    row.last_status = "queued"
    await db.commit()
    return ScheduleRunNowResponse(job_id=int(job_id))
