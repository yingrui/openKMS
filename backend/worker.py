"""Procrastinate worker entry point.

Usage:
    python worker.py

Requires openkms-cli on PATH for document processing tasks.
Environment variables are loaded from .env.
"""
import asyncio
import logging
import os
import signal
import socket
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

logger = logging.getLogger("openkms.worker")


def _worker_instance_id() -> str:
    explicit = (os.environ.get("OPENKMS_WORKER_NAME") or "").strip()
    if explicit:
        return explicit
    return socket.gethostname()


async def _heartbeat_loop(shutdown: asyncio.Event, instance_id: str) -> None:
    from app.services.heartbeat.process_heartbeat_client import report_process_heartbeat

    while not shutdown.is_set():
        await report_process_heartbeat("worker", instance_id)
        try:
            await asyncio.wait_for(shutdown.wait(), timeout=60.0)
        except asyncio.TimeoutError:
            continue


async def main() -> None:
    from app.jobs import job_app

    shutdown = asyncio.Event()
    instance_id = _worker_instance_id()

    def _handle_signal(*_args: object) -> None:
        logger.info("Worker shutdown requested")
        shutdown.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _handle_signal)
        except NotImplementedError:
            signal.signal(sig, lambda *_: shutdown.set())

    logger.info("Starting procrastinate worker (%s)...", instance_id)
    async with job_app.open_async():
        try:
            await job_app.schema_manager.apply_schema_async()
            logger.info("Procrastinate schema applied")
        except Exception:
            logger.info("Procrastinate schema already exists")
        heartbeat_task = asyncio.create_task(_heartbeat_loop(shutdown, instance_id))
        worker_task = asyncio.create_task(job_app.run_worker_async(name=instance_id))
        logger.info("Listening for jobs...")
        await asyncio.wait(
            [heartbeat_task, worker_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
        shutdown.set()
        worker_task.cancel()
        heartbeat_task.cancel()
        await asyncio.gather(worker_task, heartbeat_task, return_exceptions=True)


if __name__ == "__main__":
    asyncio.run(main())
