"""Central schedule dispatcher — single-instance cron hub."""

from __future__ import annotations

import asyncio
import logging
import signal
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

_env = Path(__file__).resolve().parent / ".env"
load_dotenv(_env)

from app.config import settings
from app.logging_config import configure_logging

configure_logging(
    backend_level=settings.backend_log_level,
    agent_level=settings.agent_log_level,
)

logger = logging.getLogger("openkms.scheduler")

SCHEDULER_INSTANCE_ID = "scheduler"


async def _run_loop(shutdown: asyncio.Event) -> None:
    from app.database import async_session_maker
    from app.services.heartbeat.process_heartbeat_client import report_process_heartbeat
    from app.services.schedules.schedule_dispatch import dispatch_due_schedules
    from app.services.schedules.schedule_slots import floor_to_minute, sleep_until_next_minute

    while not shutdown.is_set():
        slot = floor_to_minute(datetime.now(timezone.utc))
        try:
            async with async_session_maker() as session:
                count = await dispatch_due_schedules(session, slot)
            if count:
                logger.info("Dispatched %s scheduled job(s) for slot %s", count, slot.isoformat())
        except Exception:
            logger.exception("Schedule dispatch failed for slot %s", slot.isoformat())

        await report_process_heartbeat("scheduler", SCHEDULER_INSTANCE_ID)

        if shutdown.is_set():
            break
        await sleep_until_next_minute()


async def main() -> None:
    from app.jobs import job_app

    shutdown = asyncio.Event()

    def _handle_signal(*_args: object) -> None:
        logger.info("Scheduler shutdown requested")
        shutdown.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _handle_signal)
        except NotImplementedError:
            signal.signal(sig, lambda *_: shutdown.set())

    logger.info("Starting central scheduler...")
    async with job_app.open_async():
        try:
            await job_app.schema_manager.apply_schema_async()
        except Exception:
            pass
        await _run_loop(shutdown)
    logger.info("Scheduler stopped")


if __name__ == "__main__":
    asyncio.run(main())
