"""Reclaim session workspaces that nobody has touched.

A session directory has no writer to notice its own expiry: the last request simply stops arriving. So the service sweeps,
on a timer, rather than on a request.

Disabled when `session_ttl_minutes` is 0, and it never runs against a root that does not exist — a sweeper that guesses is
a deleter.
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from . import session_fs

logger = logging.getLogger(__name__)

#: How often to look. The TTL is in hours, so a quarter-hour sweep is plenty.
SWEEP_INTERVAL_SECONDS = 900


def sweep_once() -> list[str]:
    """One pass. Split out from the loop so it can be called (and tested) without a timer."""
    from .config import settings

    ttl = int(settings.session_ttl_minutes or 0)
    if ttl <= 0:
        return []
    removed = session_fs.reclaim_expired(ttl)
    if removed:
        logger.info("session workspaces reclaimed: %d", len(removed))
        _remove_containers(removed)
    return removed


def _remove_containers(session_dirs: list[str]) -> None:
    """A container belongs to its session: it goes when the directory does, never on its own timer."""
    from . import sandbox

    for path in session_dirs:
        parts = Path(path).parts
        if len(parts) < 2:
            continue
        session_id, kb_id = parts[-1], parts[-2]
        try:
            sandbox.remove_container(kb_id, session_id)
        except sandbox.SandboxError as exc:  # docker missing is not the sweeper's problem
            logger.warning("could not remove sandbox container for %s: %s", session_id, exc)


async def run_forever(interval_seconds: int = SWEEP_INTERVAL_SECONDS) -> None:
    """Sweep until cancelled. Started by the API's lifespan, stopped with it."""
    while True:
        try:
            sweep_once()
        except asyncio.CancelledError:
            raise
        except OSError as exc:
            # A sweep that fails must not take the service with it; the next one will try again.
            logger.warning("session workspace sweep failed: %s", exc)
        await asyncio.sleep(interval_seconds)
