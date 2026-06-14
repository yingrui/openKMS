"""Defer procrastinate jobs per scheduled_trigger kind."""

from __future__ import annotations

from app.models.scheduled_trigger import (
    PROJECT_AGENT_SCHEDULE_KINDS,
    SCHEDULE_KIND_CONNECTOR_SYNC,
    ScheduledTrigger,
)
from app.services.project_agent_schedule import agent_schedule_lock_name

CONNECTOR_SYNC_LOCK_PREFIX = "connector_sync:"


async def defer_scheduled_trigger(trigger: ScheduledTrigger) -> int:
    """Queue a worker job for ``trigger``; returns procrastinate job id."""
    from app.jobs.defer import defer_task
    from app.jobs.tasks import run_connector_sync, run_scheduled_project_agent

    if trigger.kind == SCHEDULE_KIND_CONNECTOR_SYNC:
        return await defer_task(
            run_connector_sync.configure(lock=f"{CONNECTOR_SYNC_LOCK_PREFIX}{trigger.target_id}"),
            connector_id=trigger.target_id,
        )
    if trigger.kind in PROJECT_AGENT_SCHEDULE_KINDS:
        return await defer_task(
            run_scheduled_project_agent.configure(lock=agent_schedule_lock_name(trigger)),
            trigger_id=trigger.id,
        )
    raise ValueError(f"Unknown schedule kind: {trigger.kind}")
