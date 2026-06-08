"""Postgres checkpointer for Deep Agents HITL resume."""

from __future__ import annotations

from collections.abc import AsyncIterator

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from app.config import settings

_saver: AsyncPostgresSaver | None = None
_cm: AsyncIterator[AsyncPostgresSaver] | None = None


async def get_checkpointer() -> AsyncPostgresSaver:
    """Return a process-wide AsyncPostgresSaver (enters from_conn_string context once)."""
    global _saver, _cm
    if _saver is None:
        _cm = AsyncPostgresSaver.from_conn_string(settings.database_url_sync)
        _saver = await _cm.__aenter__()
        await _saver.setup()
    return _saver


async def close_checkpointer() -> None:
    global _saver, _cm
    if _cm is not None:
        await _cm.__aexit__(None, None, None)
    _cm = None
    _saver = None


async def delete_conversation_thread(thread_id: str) -> None:
    """Drop LangGraph checkpoint state for a conversation (e.g. after message revert)."""
    saver = await get_checkpointer()
    await saver.adelete_thread(thread_id)
