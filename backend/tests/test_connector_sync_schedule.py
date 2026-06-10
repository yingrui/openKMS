"""Tests for sync connector schedule settings (persist only)."""

import pytest

from app.services.connector_sync.schedule import (
    daily_time_to_cron,
    normalize_sync_schedule_in_settings,
    parse_daily_time_from_cron,
    sync_schedule_to_response,
    validate_cron_expression,
)


def test_daily_time_to_cron():
    assert daily_time_to_cron(15, 5) == "5 15 * * *"


def test_parse_daily_time_from_cron():
    assert parse_daily_time_from_cron("5 15 * * *") == (15, 5)
    assert parse_daily_time_from_cron("0 9 * * 1") is None


def test_validate_cron_expression_rejects_bad():
    with pytest.raises(ValueError, match="5 fields"):
        validate_cron_expression("0 9 * *")


def test_normalize_sync_schedule_disabled():
    out = normalize_sync_schedule_in_settings(
        "tushare",
        {"sync_schedule": {"enabled": False, "timezone": "Asia/Shanghai"}},
    )
    assert out["sync_schedule"] == {
        "enabled": False,
        "cron": None,
        "timezone": "Asia/Shanghai",
    }


def test_normalize_sync_schedule_enabled_requires_cron():
    with pytest.raises(ValueError, match="cron"):
        normalize_sync_schedule_in_settings(
            "tushare",
            {"sync_schedule": {"enabled": True, "timezone": "UTC"}},
        )


def test_normalize_sync_schedule_enabled_ok():
    out = normalize_sync_schedule_in_settings(
        "tushare",
        {"sync_schedule": {"enabled": True, "cron": "5 15 * * *", "timezone": "Asia/Shanghai"}},
    )
    assert out["sync_schedule"] == {
        "enabled": True,
        "cron": "5 15 * * *",
        "timezone": "Asia/Shanghai",
    }


def test_normalize_strips_run_metadata():
    out = normalize_sync_schedule_in_settings(
        "tushare",
        {
            "sync_schedule": {
                "enabled": True,
                "cron": "5 15 * * *",
                "timezone": "UTC",
                "last_run_at": "2026-01-01T00:00:00+00:00",
                "last_status": "ok",
            }
        },
    )
    assert "last_run_at" not in out["sync_schedule"]
    assert "last_status" not in out["sync_schedule"]


def test_sync_schedule_to_response_includes_next_run_preview():
    out = sync_schedule_to_response(
        {"sync_schedule": {"enabled": True, "cron": "5 15 * * *", "timezone": "UTC"}}
    )
    assert out is not None
    assert out["enabled"] is True
    assert out["next_run_at"] is not None
