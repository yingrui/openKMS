"""Defer procrastinate jobs per scheduled_trigger kind."""

from __future__ import annotations

from app.models.scheduled_trigger import (
    PROJECT_AGENT_SCHEDULE_KINDS,
    SCHEDULE_KIND_CONNECTOR_SYNC,
    ScheduledTrigger,
    agent_schedule_lock_name,
)

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
        cfg = trigger.config if isinstance(trigger.config, dict) else {}
        return await defer_task(
            run_scheduled_project_agent.configure(lock=agent_schedule_lock_name(trigger)),
            trigger_id=trigger.id,
            project_id=str(cfg.get("project_id") or ""),
            conversation_id=cfg.get("conversation_id"),
            display_name=trigger.display_name,
        )
    raise ValueError(f"Unknown schedule kind: {trigger.kind}")
