"""Postgres checkpointer for Deep Agents HITL resume."""

from __future__ import annotations

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from app.config import settings

_saver: AsyncPostgresSaver | None = None


async def get_checkpointer() -> AsyncPostgresSaver:
    global _saver
    if _saver is None:
        _saver = AsyncPostgresSaver.from_conn_string(settings.database_url_sync)
        await _saver.setup()
    return _saver
