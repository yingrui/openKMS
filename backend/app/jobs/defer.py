"""Defer procrastinate jobs from the API without closing the shared app pool."""

from __future__ import annotations

from typing import Any

from procrastinate import types

from app.jobs import job_app


async def ensure_job_app_open() -> None:
    """Open the procrastinate pool if needed (idempotent; does not close on return)."""
    await job_app.connector.open_async()


async def defer_task(
    task: Any,
    *,
    schedule_in: types.TimeDeltaParams | None = None,
    **kwargs: types.JSONValue,
) -> int:
    """Defer a task after ensuring the procrastinate app pool is open."""
    await ensure_job_app_open()
    if schedule_in is not None:
        return await task.configure(schedule_in=schedule_in).defer_async(**kwargs)
    return await task.defer_async(**kwargs)
