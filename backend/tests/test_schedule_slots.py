"""Cron slot matching for central scheduler."""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.services.schedules.schedule_slots import floor_to_minute, is_cron_due_for_slot


def test_floor_to_minute_strips_seconds():
    dt = datetime(2026, 6, 5, 15, 7, 42, tzinfo=timezone.utc)
    assert floor_to_minute(dt) == datetime(2026, 6, 5, 15, 7, 0, tzinfo=timezone.utc)


def test_is_cron_due_daily_at_slot():
    cron = "5 15 * * *"
    slot = datetime(2026, 6, 5, 15, 5, 0, tzinfo=timezone.utc)
    assert is_cron_due_for_slot(cron, "UTC", slot) is True


def test_is_cron_due_false_off_minute():
    cron = "5 15 * * *"
    slot = datetime(2026, 6, 5, 15, 6, 0, tzinfo=timezone.utc)
    assert is_cron_due_for_slot(cron, "UTC", slot) is False


def test_is_cron_due_respects_timezone():
    cron = "0 9 * * *"
    # 09:00 Asia/Shanghai = 01:00 UTC
    slot = datetime(2026, 6, 5, 1, 0, 0, tzinfo=timezone.utc)
    assert is_cron_due_for_slot(cron, "Asia/Shanghai", slot) is True
    local = slot.astimezone(ZoneInfo("Asia/Shanghai"))
    assert local.hour == 9 and local.minute == 0
