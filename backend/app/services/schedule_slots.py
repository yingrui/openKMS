"""Cron slot helpers for the central scheduler."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from croniter import croniter

from app.services.connector_sync.schedule import validate_cron_expression, validate_timezone


def floor_to_minute(dt: datetime) -> datetime:
    """UTC minute boundary."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.replace(second=0, microsecond=0)


def is_cron_due_for_slot(cron: str, tz_name: str, slot_utc: datetime) -> bool:
    """True when ``slot_utc`` (minute floor UTC) is a cron fire time in ``tz_name``."""
    validate_cron_expression(cron)
    tz = ZoneInfo(validate_timezone(tz_name))
    local_slot = floor_to_minute(slot_utc).astimezone(tz).replace(second=0, microsecond=0)
    base = local_slot - timedelta(seconds=1)
    itr = croniter(cron, base)
    nxt = itr.get_next(datetime)
    if nxt.tzinfo is None:
        nxt = nxt.replace(tzinfo=tz)
    nxt_local = nxt.astimezone(tz).replace(second=0, microsecond=0)
    return nxt_local == local_slot


async def sleep_until_next_minute() -> None:
    import asyncio
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    next_minute = floor_to_minute(now) + timedelta(minutes=1)
    delay = max(0.0, (next_minute - now).total_seconds())
    await asyncio.sleep(delay)
