"""Procrastinate worker entry point.

Usage:
    python worker.py

Requires openkms-cli on PATH for document processing tasks.
Environment variables are loaded from .env.
"""
import asyncio
import logging
from pathlib import Path

from dotenv import load_dotenv

_env = Path(__file__).resolve().parent / ".env"
load_dotenv(_env)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-8s %(name)s: %(message)s")
logger = logging.getLogger("openkms.worker")


async def main() -> None:
    from app.jobs import job_app

    logger.info("Starting procrastinate worker...")
    async with job_app.open_async():
        try:
            await job_app.schema_manager.apply_schema_async()
            logger.info("Procrastinate schema applied")
        except Exception:
            logger.info("Procrastinate schema already exists")
        logger.info("Listening for jobs...")
        await job_app.run_worker_async()


if __name__ == "__main__":
    asyncio.run(main())
