"""Cron validation, normalization, and next-run preview for connector sync schedules.

Execution is driven by ``scheduled_triggers`` and the central ``scheduler`` process.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from croniter import croniter

from app.services.connector_catalog import CATEGORY_SYNC, get_kind_spec

SYNC_SCHEDULE_KEY = "sync_schedule"


def validate_cron_expression(cron: str) -> str:
    """Return normalized 5-field cron or raise ValueError."""
    parts = cron.strip().split()
    if len(parts) != 5:
        raise ValueError("Cron expression must have 5 fields (minute hour day month weekday).")
    try:
        croniter(" ".join(parts))
    except (KeyError, ValueError) as e:
        raise ValueError(f"Invalid cron expression: {e}") from e
    return " ".join(parts)


def validate_timezone(tz_name: str) -> str:
    name = (tz_name or "UTC").strip() or "UTC"
    try:
        ZoneInfo(name)
    except ZoneInfoNotFoundError as e:
        raise ValueError(f"Unknown timezone '{name}'.") from e
    return name


def daily_time_to_cron(hour: int, minute: int) -> str:
    if not 0 <= hour <= 23:
        raise ValueError("Hour must be between 0 and 23.")
    if not 0 <= minute <= 59:
        raise ValueError("Minute must be between 0 and 59.")
    return f"{minute} {hour} * * *"


def parse_daily_time_from_cron(cron: str) -> tuple[int, int] | None:
    """If cron is a simple daily schedule, return (hour, minute) in local time."""
    parts = cron.strip().split()
    if len(parts) != 5:
        return None
    minute_s, hour_s, dom, month, dow = parts
    if dom != "*" or month != "*" or dow != "*":
        return None
    try:
        minute = int(minute_s)
        hour = int(hour_s)
    except ValueError:
        return None
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    return hour, minute


def extract_sync_schedule(settings: dict[str, Any] | None) -> dict[str, Any] | None:
    if not settings or SYNC_SCHEDULE_KEY not in settings:
        return None
    raw = settings.get(SYNC_SCHEDULE_KEY)
    if not isinstance(raw, dict):
        return None
    return dict(raw)


def sync_schedule_to_response(settings: dict[str, Any] | None) -> dict[str, Any] | None:
    raw = extract_sync_schedule(settings)
    if not raw:
        return None
    enabled = bool(raw.get("enabled"))
    cron = raw.get("cron")
    tz = str(raw.get("timezone") or "UTC")
    out: dict[str, Any] = {
        "enabled": enabled,
        "cron": cron if isinstance(cron, str) else None,
        "timezone": tz,
        "next_run_at": None,
    }
    if enabled and isinstance(cron, str) and cron.strip():
        try:
            out["next_run_at"] = compute_next_run_at(cron.strip(), tz)
        except ValueError:
            out["next_run_at"] = None
    return out


def compute_next_run_at(cron: str, tz_name: str, *, from_dt: datetime | None = None) -> datetime:
    """Next fire time in UTC (API preview; scheduler uses separate slot matching)."""
    validate_cron_expression(cron)
    tz = ZoneInfo(validate_timezone(tz_name))
    base = from_dt or datetime.now(timezone.utc)
    local = base.astimezone(tz)
    itr = croniter(cron, local)
    nxt = itr.get_next(datetime)
    if nxt.tzinfo is None:
        nxt = nxt.replace(tzinfo=tz)
    return nxt.astimezone(timezone.utc)


def normalize_sync_schedule_in_settings(kind: str, settings: dict[str, Any]) -> dict[str, Any]:
    """Validate and normalize sync_schedule for sync connector kinds."""
    spec = get_kind_spec(kind)
    if not spec or spec.category != CATEGORY_SYNC:
        if SYNC_SCHEDULE_KEY in settings:
            raise ValueError("sync_schedule is only supported for sync connector kinds.")
        return settings

    raw = settings.get(SYNC_SCHEDULE_KEY)
    if raw is None:
        return settings
    if not isinstance(raw, dict):
        raise ValueError("sync_schedule must be an object.")

    enabled = bool(raw.get("enabled"))
    tz = validate_timezone(str(raw.get("timezone") or "UTC"))
    if not enabled:
        settings[SYNC_SCHEDULE_KEY] = {
            "enabled": False,
            "cron": None,
            "timezone": tz,
        }
        return settings

    cron_raw = raw.get("cron")
    if not isinstance(cron_raw, str) or not cron_raw.strip():
        raise ValueError("sync_schedule.cron is required when scheduling is enabled.")
    cron = validate_cron_expression(cron_raw)
    settings[SYNC_SCHEDULE_KEY] = {
        "enabled": True,
        "cron": cron,
        "timezone": tz,
    }
    return settings
