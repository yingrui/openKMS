"""Central scheduler: scan registry and defer due jobs."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scheduled_trigger import ScheduledTrigger
from app.services.schedules.schedule_handlers import defer_scheduled_trigger
from app.services.schedules.schedule_slots import floor_to_minute, is_cron_due_for_slot

logger = logging.getLogger(__name__)

SCHEDULER_ADVISORY_LOCK_ID = 0x4F4B4D53534348


async def try_acquire_scheduler_lock(session: AsyncSession) -> bool:
    result = await session.execute(
        text("SELECT pg_try_advisory_lock(:lock_id)"),
        {"lock_id": SCHEDULER_ADVISORY_LOCK_ID},
    )
    return bool(result.scalar())


async def release_scheduler_lock(session: AsyncSession) -> None:
    await session.execute(
        text("SELECT pg_advisory_unlock(:lock_id)"),
        {"lock_id": SCHEDULER_ADVISORY_LOCK_ID},
    )


async def dispatch_due_schedules(session: AsyncSession, slot: datetime | None = None) -> int:
    """Defer jobs for triggers due at ``slot`` (UTC minute floor). Returns defer count."""
    slot_utc = floor_to_minute(slot or datetime.now(timezone.utc))
    deferred = 0

    if not await try_acquire_scheduler_lock(session):
        logger.debug("Scheduler lock not acquired; skipping dispatch for %s", slot_utc.isoformat())
        return 0

    try:
        result = await session.execute(
            select(ScheduledTrigger).where(ScheduledTrigger.enabled.is_(True))
        )
        triggers = result.scalars().all()

        for trigger in triggers:
            if trigger.last_fired_slot == slot_utc:
                continue
            if not trigger.cron:
                continue
            try:
                if not is_cron_due_for_slot(trigger.cron, trigger.timezone, slot_utc):
                    continue
            except ValueError as exc:
                logger.warning(
                    "Skipping trigger %s (%s): invalid cron/tz: %s",
                    trigger.id,
                    trigger.display_name,
                    exc,
                )
                continue

            try:
                job_id = await defer_scheduled_trigger(trigger)
            except ValueError as exc:
                logger.warning(
                    "Skipping trigger %s (%s): %s",
                    trigger.id,
                    trigger.display_name,
                    exc,
                )
                continue

            trigger.last_fired_slot = slot_utc
            trigger.last_run_at = datetime.now(timezone.utc)
            trigger.last_job_id = int(job_id) if job_id is not None else None
            trigger.last_status = "queued"
            deferred += 1
            logger.info(
                "Deferred %s for trigger %s (%s) as job %s",
                trigger.kind,
                trigger.id,
                trigger.display_name,
                job_id,
            )

        await session.commit()
        return deferred
    except Exception:
        await session.rollback()
        raise
    finally:
        await release_scheduler_lock(session)


async def update_trigger_after_sync(
    session: AsyncSession,
    connector_id: str,
    *,
    job_id: int | None,
    status: str,
) -> None:
    """Record completion/failure on the registry row after ``run_connector_sync``."""
    from app.models.scheduled_trigger import SCHEDULE_KIND_CONNECTOR_SYNC

    result = await session.execute(
        select(ScheduledTrigger).where(
            ScheduledTrigger.kind == SCHEDULE_KIND_CONNECTOR_SYNC,
            ScheduledTrigger.target_id == connector_id,
        )
    )
    trigger = result.scalar_one_or_none()
    if not trigger:
        return
    trigger.last_run_at = datetime.now(timezone.utc)
    trigger.last_status = status
    if job_id is not None:
        trigger.last_job_id = job_id


async def update_trigger_after_agent_job(
    session: AsyncSession,
    trigger_id: str,
    *,
    job_id: int | None,
    status: str,
) -> None:
    """Record completion/failure on a project agent schedule row."""
    row = await session.get(ScheduledTrigger, trigger_id)
    if not row:
        return
    row.last_run_at = datetime.now(timezone.utc)
    row.last_status = status
    if job_id is not None:
        row.last_job_id = job_id
