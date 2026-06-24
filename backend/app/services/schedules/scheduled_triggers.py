"""Registry CRUD and connector write-through for ``scheduled_triggers``."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.connector import Connector
from app.models.scheduled_trigger import SCHEDULE_KIND_CONNECTOR_SYNC, ScheduledTrigger
from app.services.connectors.connector_catalog import CATEGORY_SYNC, get_kind_spec
from app.services.connectors.schedule import (
    SYNC_SCHEDULE_KEY,
    compute_next_run_at,
    extract_sync_schedule,
    validate_cron_expression,
    validate_timezone,
)


def _schedule_from_connector_settings(settings: dict[str, Any] | None) -> dict[str, Any] | None:
    raw = extract_sync_schedule(settings)
    if not raw:
        return None
    return raw


async def get_trigger_for_connector(
    db: AsyncSession, connector_id: str
) -> ScheduledTrigger | None:
    result = await db.execute(
        select(ScheduledTrigger).where(
            ScheduledTrigger.kind == SCHEDULE_KIND_CONNECTOR_SYNC,
            ScheduledTrigger.target_id == connector_id,
        )
    )
    return result.scalar_one_or_none()


async def upsert_connector_sync_trigger(db: AsyncSession, connector: Connector) -> ScheduledTrigger | None:
    """Mirror connector ``settings.sync_schedule`` into the central registry."""
    spec = get_kind_spec(connector.kind)
    if not spec or spec.category != CATEGORY_SYNC:
        await delete_connector_sync_trigger(db, connector.id)
        return None

    sched = _schedule_from_connector_settings(connector.settings)
    if not sched:
        await delete_connector_sync_trigger(db, connector.id)
        return None

    enabled = bool(sched.get("enabled"))
    tz = validate_timezone(str(sched.get("timezone") or "UTC"))
    cron_raw = sched.get("cron")
    cron: str | None = None
    if enabled:
        if not connector.outputs:
            raise ValueError(
                "Scheduled sync requires all output datasets to be configured, "
                "or disable scheduled sync to save without datasets."
            )
        if not isinstance(cron_raw, str) or not cron_raw.strip():
            raise ValueError("sync_schedule.cron is required when scheduling is enabled.")
        cron = validate_cron_expression(cron_raw)

    existing = await get_trigger_for_connector(db, connector.id)
    active = enabled and connector.enabled
    if existing:
        existing.display_name = connector.name
        existing.enabled = active
        existing.cron = cron if enabled else None
        existing.timezone = tz
        return existing

    if not enabled:
        return None

    row = ScheduledTrigger(
        id=str(uuid.uuid4()),
        kind=SCHEDULE_KIND_CONNECTOR_SYNC,
        target_id=connector.id,
        display_name=connector.name,
        cron=cron,
        timezone=tz,
        enabled=active,
    )
    db.add(row)
    return row


async def delete_connector_sync_trigger(db: AsyncSession, connector_id: str) -> None:
    row = await get_trigger_for_connector(db, connector_id)
    if row:
        await db.delete(row)


def merge_sync_schedule_response(
    connector: Connector,
    trigger: ScheduledTrigger | None,
) -> dict[str, Any] | None:
    """Build API ``sync_schedule`` from settings + registry runtime fields."""
    sched = _schedule_from_connector_settings(connector.settings)
    if not sched and not trigger:
        return None

    enabled = bool(sched.get("enabled")) if sched else bool(trigger and trigger.enabled)
    cron = sched.get("cron") if sched else (trigger.cron if trigger else None)
    tz = str((sched or {}).get("timezone") or (trigger.timezone if trigger else "UTC"))

    out: dict[str, Any] = {
        "enabled": enabled,
        "cron": cron if isinstance(cron, str) else None,
        "timezone": tz,
        "next_run_at": None,
        "last_run_at": trigger.last_run_at if trigger else None,
        "last_status": trigger.last_status if trigger else None,
        "last_job_id": trigger.last_job_id if trigger else None,
    }
    if enabled and isinstance(out["cron"], str) and out["cron"].strip():
        try:
            out["next_run_at"] = compute_next_run_at(out["cron"].strip(), tz)
        except ValueError:
            out["next_run_at"] = None
    return out
