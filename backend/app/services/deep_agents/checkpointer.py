"""Postgres checkpointer for Deep Agents HITL resume."""

from __future__ import annotations

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

_pool: AsyncConnectionPool | None = None
_saver: AsyncPostgresSaver | None = None

# Same tables/order as langgraph AsyncPostgresSaver.adelete_thread (no pipeline mode).
_CHECKPOINT_THREAD_DELETE_STATEMENTS = (
    "DELETE FROM checkpoints WHERE thread_id = :tid",
    "DELETE FROM checkpoint_blobs WHERE thread_id = :tid",
    "DELETE FROM checkpoint_writes WHERE thread_id = :tid",
)


async def get_checkpointer() -> AsyncPostgresSaver:
    """Return a process-wide checkpointer backed by a connection pool.

    A single shared psycopg connection (from_conn_string) breaks under concurrent agent
    turns with ``another command is already in progress``. The pool checks out one
    connection per checkpoint operation.
    """
    global _pool, _saver
    if _saver is None:
        _pool = AsyncConnectionPool(
            conninfo=settings.database_url_sync,
            kwargs={
                "autocommit": True,
                "prepare_threshold": 0,
                "row_factory": dict_row,
            },
            min_size=2,
            max_size=20,
            open=False,
        )
        await _pool.open()
        _saver = AsyncPostgresSaver(_pool)
        await _saver.setup()
    return _saver


async def close_checkpointer() -> None:
    global _pool, _saver
    if _pool is not None:
        await _pool.close()
    _pool = None
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
