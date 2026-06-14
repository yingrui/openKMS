"""Central schedule dispatch."""

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy.dialects import postgresql

from app.models.scheduled_trigger import SCHEDULE_KIND_CONNECTOR_SYNC, ScheduledTrigger
from app.services.schedule_dispatch import dispatch_due_schedules


def test_dispatch_skips_when_lock_not_acquired():
    session = AsyncMock()
    with patch(
        "app.services.schedule_dispatch.try_acquire_scheduler_lock",
        AsyncMock(return_value=False),
    ):
        count = asyncio.run(
            dispatch_due_schedules(session, datetime(2026, 6, 5, 15, 5, tzinfo=timezone.utc))
        )
    assert count == 0
    session.commit.assert_not_called()


def test_dispatch_defers_due_trigger():
    slot = datetime(2026, 6, 5, 15, 5, tzinfo=timezone.utc)
    trigger = ScheduledTrigger(
        id="t1",
        kind=SCHEDULE_KIND_CONNECTOR_SYNC,
        target_id="conn-1",
        display_name="Test",
        cron="5 15 * * *",
        timezone="UTC",
        enabled=True,
    )

    session = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = [trigger]
    session.execute = AsyncMock(return_value=result)
    session.commit = AsyncMock()

    with (
        patch(
            "app.services.schedule_dispatch.try_acquire_scheduler_lock",
            AsyncMock(return_value=True),
        ),
        patch(
            "app.services.schedule_dispatch.release_scheduler_lock",
            AsyncMock(),
        ),
        patch("app.services.schedule_dispatch.is_cron_due_for_slot", return_value=True),
        patch("app.services.schedule_handlers.defer_scheduled_trigger", AsyncMock(return_value=99)) as defer_mock,
    ):
        count = asyncio.run(dispatch_due_schedules(session, slot))

    assert count == 1
    defer_mock.assert_awaited_once()
    assert trigger.last_fired_slot == slot
    assert trigger.last_job_id == 99
    assert trigger.last_status == "queued"


def test_dispatch_queries_only_enabled_triggers():
    """Disabled schedules (Enabled unchecked) must not be loaded for dispatch."""
    slot = datetime(2026, 6, 5, 15, 5, tzinfo=timezone.utc)
    session = AsyncMock()
    captured_stmt = None

    async def capture_execute(stmt):
        nonlocal captured_stmt
        captured_stmt = stmt
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        return result

    session.execute = capture_execute
    session.commit = AsyncMock()

    with (
        patch(
            "app.services.schedule_dispatch.try_acquire_scheduler_lock",
            AsyncMock(return_value=True),
        ),
        patch(
            "app.services.schedule_dispatch.release_scheduler_lock",
            AsyncMock(),
        ),
    ):
        count = asyncio.run(dispatch_due_schedules(session, slot))

    assert count == 0
    assert captured_stmt is not None
    compiled = captured_stmt.compile(
        dialect=postgresql.dialect(),
        compile_kwargs={"literal_binds": True},
    )
    sql = str(compiled).lower()
    assert "enabled" in sql
    assert "true" in sql


def test_dispatch_does_not_defer_when_no_enabled_triggers():
    """Simulates DB returning no rows when every schedule is disabled."""
    slot = datetime(2026, 6, 5, 15, 5, tzinfo=timezone.utc)
    session = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    session.execute = AsyncMock(return_value=result)
    session.commit = AsyncMock()

    with (
        patch(
            "app.services.schedule_dispatch.try_acquire_scheduler_lock",
            AsyncMock(return_value=True),
        ),
        patch(
            "app.services.schedule_dispatch.release_scheduler_lock",
            AsyncMock(),
        ),
        patch("app.services.schedule_handlers.defer_scheduled_trigger", AsyncMock(return_value=99)) as defer_mock,
    ):
        count = asyncio.run(dispatch_due_schedules(session, slot))

    assert count == 0
    defer_mock.assert_not_awaited()
