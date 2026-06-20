"""Postgres checkpointer for Deep Agents HITL resume."""

from __future__ import annotations

from collections.abc import AsyncIterator

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

_saver: AsyncPostgresSaver | None = None
_cm: AsyncIterator[AsyncPostgresSaver] | None = None

# Same tables/order as langgraph AsyncPostgresSaver.adelete_thread (no pipeline mode).
_CHECKPOINT_THREAD_DELETE_STATEMENTS = (
    "DELETE FROM checkpoints WHERE thread_id = :tid",
    "DELETE FROM checkpoint_blobs WHERE thread_id = :tid",
    "DELETE FROM checkpoint_writes WHERE thread_id = :tid",
)


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


async def delete_conversation_thread(db: AsyncSession, thread_id: str) -> None:
    """Drop LangGraph checkpoint state for a conversation (e.g. after message revert).

    Uses the caller's SQLAlchemy session so deletes stay in the same transaction as
    message edits. Avoids LangGraph's pipeline-mode checkpointer connection, which can
    fail with psycopg OperationalError under concurrent API load.
    """
    tid = str(thread_id)
    for stmt in _CHECKPOINT_THREAD_DELETE_STATEMENTS:
        await db.execute(text(stmt), {"tid": tid})
