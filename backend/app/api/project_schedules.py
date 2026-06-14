"""Project agent schedule CRUD API."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_permission
from app.api.deps import get_jwt_sub
from app.database import get_db
from app.models.scheduled_trigger import (
    SCHEDULE_KIND_PROJECT_AGENT_STATEFUL,
    SCHEDULE_KIND_PROJECT_AGENT_STATELESS,
)
from app.schemas.project_agent_schedule import (
    ProjectAgentScheduleCreate,
    ProjectAgentScheduleOut,
    ProjectAgentSchedulePatch,
    ProjectAgentScheduleRunNowResponse,
)
from app.services.connector_sync.schedule import compute_next_run_at, validate_cron_expression, validate_timezone
from app.services.permission_catalog import PERM_PROJECTS_READ, PERM_PROJECTS_WRITE
from app.services.project_agent_schedule import (
    create_agent_schedule,
    delete_agent_schedule_row,
    get_agent_schedule_for_project,
    get_project_owned,
    list_agent_schedules_for_project,
    normalize_agent_schedule_config,
)


def _to_out(row) -> ProjectAgentScheduleOut:
    cfg = row.config if isinstance(row.config, dict) else {}
    next_run = None
    if row.enabled and row.cron:
        try:
            next_run = compute_next_run_at(row.cron, row.timezone)
        except ValueError:
            next_run = None
    mode = "stateful" if row.kind == SCHEDULE_KIND_PROJECT_AGENT_STATEFUL else "stateless"
    return ProjectAgentScheduleOut(
        id=row.id,
        kind=row.kind,
        mode=mode,
        project_id=str(cfg.get("project_id") or ""),
        conversation_id=cfg.get("conversation_id"),
        last_conversation_id=cfg.get("last_conversation_id"),
        display_name=row.display_name,
        cron=row.cron,
        timezone=row.timezone,
        enabled=row.enabled,
        prompt=str(cfg.get("prompt") or ""),
        plan_mode=bool(cfg.get("plan_mode")),
        on_run_completed=str(cfg.get("on_run_completed") or "keep"),
        next_run_at=next_run,
        last_fired_slot=row.last_fired_slot,
        last_run_at=row.last_run_at,
        last_status=row.last_status,
        last_job_id=row.last_job_id,
    )


def build_project_schedules_router() -> APIRouter:
    router = APIRouter()

    @router.get(
        "/{project_id}/schedules",
        response_model=list[ProjectAgentScheduleOut],
        dependencies=[Depends(require_permission(PERM_PROJECTS_READ))],
    )
    async def list_schedules(project_id: str, request: Request, db: AsyncSession = Depends(get_db)):
        sub = get_jwt_sub(request)
        await get_project_owned(db, project_id, sub)
        rows = await list_agent_schedules_for_project(db, project_id)
        return [_to_out(r) for r in rows]

    @router.post(
        "/{project_id}/schedules",
        response_model=ProjectAgentScheduleOut,
        status_code=201,
        dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
    )
    async def create_schedule(
        project_id: str,
        body: ProjectAgentScheduleCreate,
        request: Request,
        db: AsyncSession = Depends(get_db),
    ):
        sub = get_jwt_sub(request)
        project = await get_project_owned(db, project_id, sub)
        if body.plan_mode:
            raise HTTPException(status_code=400, detail="plan_mode is not supported for scheduled runs")
        try:
            row = await create_agent_schedule(
                db,
                project=project,
                owner_sub=sub,
                display_name=body.display_name,
                mode=body.mode,
                cron=body.cron,
                timezone_name=body.timezone,
                prompt=body.prompt,
                enabled=body.enabled,
                plan_mode=False,
                on_run_completed=body.on_run_completed,
                conversation_id=body.conversation_id,
                jwt_payload=request.state.openkms_jwt_payload,
            )
            await db.commit()
            await db.refresh(row)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return _to_out(row)

    @router.patch(
        "/{project_id}/schedules/{schedule_id}",
        response_model=ProjectAgentScheduleOut,
        dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
    )
    async def patch_schedule(
        project_id: str,
        schedule_id: str,
        body: ProjectAgentSchedulePatch,
        request: Request,
        db: AsyncSession = Depends(get_db),
    ):
        sub = get_jwt_sub(request)
        await get_project_owned(db, project_id, sub)
        row = await get_agent_schedule_for_project(db, project_id, schedule_id)
        cfg = dict(row.config) if isinstance(row.config, dict) else {}

        if body.display_name is not None:
            row.display_name = body.display_name.strip()[:256]
        if body.prompt is not None:
            cfg["prompt"] = body.prompt.strip()
        if body.timezone is not None:
            row.timezone = validate_timezone(body.timezone)
        if body.cron is not None:
            row.cron = validate_cron_expression(body.cron) if body.cron.strip() else None
        if body.enabled is not None:
            row.enabled = body.enabled
            if row.enabled and not row.cron:
                raise HTTPException(status_code=400, detail="cron is required when enabling a schedule")
        if body.on_run_completed is not None:
            cfg["on_run_completed"] = body.on_run_completed

        try:
            normalize_agent_schedule_config(cfg)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        row.config = cfg
        await db.commit()
        await db.refresh(row)
        return _to_out(row)

    @router.delete(
        "/{project_id}/schedules/{schedule_id}",
        status_code=204,
        dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
    )
    async def delete_schedule(
        project_id: str,
        schedule_id: str,
        request: Request,
        db: AsyncSession = Depends(get_db),
    ):
        sub = get_jwt_sub(request)
        await get_project_owned(db, project_id, sub)
        row = await get_agent_schedule_for_project(db, project_id, schedule_id)
        await delete_agent_schedule_row(db, row)
        await db.commit()

    @router.post(
        "/{project_id}/schedules/{schedule_id}/run-now",
        response_model=ProjectAgentScheduleRunNowResponse,
        status_code=202,
        dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
    )
    async def run_schedule_now(
        project_id: str,
        schedule_id: str,
        request: Request,
        db: AsyncSession = Depends(get_db),
    ):
        sub = get_jwt_sub(request)
        await get_project_owned(db, project_id, sub)
        row = await get_agent_schedule_for_project(db, project_id, schedule_id)
        from app.services.schedule_handlers import defer_scheduled_trigger

        job_id = await defer_scheduled_trigger(row)
        row.last_run_at = datetime.now(timezone.utc)
        row.last_job_id = int(job_id)
        row.last_status = "queued"
        await db.commit()
        return ProjectAgentScheduleRunNowResponse(job_id=int(job_id))

    return router
