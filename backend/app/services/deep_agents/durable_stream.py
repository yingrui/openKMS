"""Disconnect-safe project agent streams with mid-turn persistence.

Interactive turns keep streaming NDJSON to the browser while connected, but the
agent loop runs in a background task with its own DB session so sleep / navigate
away does not cancel work or roll back the chat turn.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import async_session_maker
from app.models.agent_models import AgentConversation, AgentMessage
from app.services.agent.shared import WIKI_TOOL_TRANSCRIPTS_KEY, _bump_conversation_timestamp, _msg_to_out
from app.services.deep_agents.observability import AgentTurnContext
from app.services.deep_agents.stream_accumulator import ProjectStreamAccumulator

logger = logging.getLogger(__name__)

_BACKGROUND_TASKS: set[asyncio.Task[Any]] = set()
_PERSIST_INTERVAL_S = 2.0
# Keep in sync with frontend `AGENT_TURN_STALE_MS`.
STALE_RUNNING_SECONDS = 2 * 60 * 60
_SENTINEL = object()

PartsFactory = Callable[[AsyncSession, AgentConversation], AsyncIterator[dict[str, Any]]]


def _ndjson_line(obj: dict) -> bytes:
    return (json.dumps(obj, ensure_ascii=False, default=str) + "\n").encode()


def _error_ndjson_line(err: str, asst: AgentMessage) -> bytes:
    return _ndjson_line(
        {
            "type": "error",
            "detail": err,
            "message": _msg_to_out(asst).model_dump(mode="json"),
        }
    )


def _track_background(task: asyncio.Task[Any]) -> None:
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)


def conversation_turn_is_active(conversation: AgentConversation) -> bool:
    """True when another interactive turn should not start (in-flight, not stale)."""
    lt = (conversation.context or {}).get("last_turn")
    if not isinstance(lt, dict) or lt.get("status") != "running":
        return False
    started = lt.get("started_at")
    if not isinstance(started, str) or not started:
        return True
    try:
        t = datetime.fromisoformat(started.replace("Z", "+00:00"))
    except ValueError:
        return True
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    age = (datetime.now(timezone.utc) - t).total_seconds()
    return age < STALE_RUNNING_SECONDS


def tool_payload_from_traces(traces: list[dict[str, str]]) -> dict[str, Any] | None:
    return {WIKI_TOOL_TRANSCRIPTS_KEY: traces} if traces else None


async def prepare_streaming_turn(
    db: AsyncSession,
    conversation: AgentConversation,
    turn: AgentTurnContext,
    *,
    assistant_id: str,
) -> AgentMessage:
    """Create empty assistant row, mark last_turn running, and commit immediately."""
    asst = AgentMessage(
        id=assistant_id,
        conversation_id=conversation.id,
        role="assistant",
        content="",
        tool_calls=None,
    )
    db.add(asst)
    turn.mark_running(conversation, assistant_message_id=assistant_id)
    _bump_conversation_timestamp(conversation)
    await db.commit()
    await db.refresh(asst)
    return asst


async def mark_streaming_turn_running(
    db: AsyncSession,
    conversation: AgentConversation,
    turn: AgentTurnContext,
    *,
    assistant_id: str,
) -> None:
    """Mark an existing assistant row's turn as running and commit (HITL resume)."""
    turn.mark_running(conversation, assistant_message_id=assistant_id)
    _bump_conversation_timestamp(conversation)
    await db.commit()


async def _load_conversation(session: AsyncSession, conversation_id: str) -> AgentConversation:
    c = await session.get(
        AgentConversation,
        conversation_id,
        options=[selectinload(AgentConversation.messages)],
    )
    if c is None:
        raise RuntimeError(f"Conversation {conversation_id} disappeared during turn")
    return c


async def _load_assistant(session: AsyncSession, assistant_id: str) -> AgentMessage:
    asst = await session.get(AgentMessage, assistant_id)
    if asst is None:
        raise RuntimeError(f"Assistant message {assistant_id} disappeared during turn")
    return asst


async def _flush_assistant_progress(
    session: AsyncSession,
    conversation: AgentConversation,
    asst: AgentMessage,
    acc: ProjectStreamAccumulator,
    *,
    existing_traces: list[dict[str, str]] | None = None,
    content_prefix: str = "",
) -> None:
    merged = list(existing_traces or []) + acc.tool_traces
    body = acc.assistant_text or ""
    asst.content = f"{content_prefix}{body}" if content_prefix else body
    asst.tool_calls = tool_payload_from_traces(merged)
    _bump_conversation_timestamp(conversation)
    await session.commit()


async def _persist_failed_assistant(
    session: AsyncSession,
    conversation: AgentConversation,
    turn: AgentTurnContext,
    asst: AgentMessage,
    err: str,
    acc: ProjectStreamAccumulator,
    *,
    existing_traces: list[dict[str, str]] | None = None,
    content_prefix: str = "",
    exc: BaseException | None = None,
) -> AgentMessage:
    merged = list(existing_traces or []) + acc.tool_traces
    body = acc.assistant_text or ""
    prefixed = f"{content_prefix}{body}" if content_prefix else body
    asst.content = f"{prefixed}\n\n{err}".strip() if prefixed else err
    asst.tool_calls = tool_payload_from_traces(merged)
    if not turn._finished:
        turn.log_failed(
            err,
            exc=exc,
            conversation=conversation,
            tool_count=len(merged),
        )
    else:
        turn.apply_last_turn(
            conversation,
            status="failed",
            error=err,
            tool_count=len(merged),
            assistant_message_id=asst.id,
        )
    _bump_conversation_timestamp(conversation)
    await session.commit()
    await session.refresh(asst)
    return asst


class ClientBridge:
    """Queue bridge: background producer → HTTP stream consumer."""

    def __init__(self) -> None:
        self.queue: asyncio.Queue[Any] = asyncio.Queue(maxsize=256)
        self._listening = True

    def stop_listening(self) -> None:
        self._listening = False

    async def emit(self, item: Any) -> None:
        if not self._listening:
            return
        try:
            self.queue.put_nowait(item)
        except asyncio.QueueFull:
            # Drop events if the client is too slow; DB persistence still continues.
            pass

    async def close(self) -> None:
        if not self._listening:
            return
        try:
            self.queue.put_nowait(_SENTINEL)
        except asyncio.QueueFull:
            pass


async def _iter_ndjson_from_bridge(bridge: ClientBridge) -> AsyncIterator[bytes]:
    try:
        while True:
            item = await bridge.queue.get()
            if item is _SENTINEL:
                break
            if isinstance(item, bytes):
                yield item
            elif isinstance(item, dict):
                yield _ndjson_line(item)
    finally:
        bridge.stop_listening()


async def run_project_turn_background(
    *,
    bridge: ClientBridge,
    conversation_id: str,
    assistant_id: str,
    turn: AgentTurnContext,
    parts_factory: PartsFactory,
    user_message_payload: dict[str, Any] | None = None,
    existing_traces: list[dict[str, str]] | None = None,
    content_prefix: str = "",
) -> None:
    """Run agent loop detached from the HTTP request session."""
    acc = ProjectStreamAccumulator()
    last_persist = time.monotonic()
    traces_at_persist = 0

    async with async_session_maker() as session:
        try:
            conversation = await _load_conversation(session, conversation_id)
            asst = await _load_assistant(session, assistant_id)
            if user_message_payload is not None:
                await bridge.emit({"type": "user", "message": user_message_payload})

            async def maybe_persist(*, force: bool = False) -> None:
                nonlocal last_persist, traces_at_persist
                now = time.monotonic()
                tools_changed = len(acc.tool_traces) != traces_at_persist
                if not force and not tools_changed and (now - last_persist) < _PERSIST_INTERVAL_S:
                    return
                await _flush_assistant_progress(
                    session,
                    conversation,
                    asst,
                    acc,
                    existing_traces=existing_traces,
                    content_prefix=content_prefix,
                )
                last_persist = now
                traces_at_persist = len(acc.tool_traces)

            async for part in parts_factory(session, conversation):
                status = acc.absorb(part)
                if status == "fatal":
                    err = str(part.get("message") or "Error") if isinstance(part, dict) else "Error"
                    failed = await _persist_failed_assistant(
                        session,
                        conversation,
                        turn,
                        asst,
                        err,
                        acc,
                        existing_traces=existing_traces,
                        content_prefix=content_prefix,
                    )
                    await bridge.emit(_error_ndjson_line(err, failed))
                    return
                await bridge.emit(part)
                force = part.get("type") in ("tool_end", "tool_error", "interrupt")
                await maybe_persist(force=force)

            if acc.interrupted:
                await _flush_assistant_progress(
                    session,
                    conversation,
                    asst,
                    acc,
                    existing_traces=existing_traces,
                    content_prefix=content_prefix,
                )
                merged = list(existing_traces or []) + acc.tool_traces
                turn.apply_last_turn(
                    conversation,
                    status="interrupted",
                    tool_count=len(merged),
                    assistant_message_id=asst.id,
                    interrupt=acc.interrupt_payload,
                )
                _bump_conversation_timestamp(conversation)
                await session.commit()
                await session.refresh(asst)
                await bridge.emit(
                    {
                        "type": "done",
                        "assistant": _msg_to_out(asst).model_dump(mode="json"),
                    }
                )
                return

            merged = list(existing_traces or []) + acc.tool_traces
            body = acc.assistant_text or ""
            asst.content = f"{content_prefix}{body}" if content_prefix else body
            asst.tool_calls = tool_payload_from_traces(merged)
            turn.log_done(
                tool_count=len(merged),
                assistant_chars=len(body),
                conversation=conversation,
            )
            _bump_conversation_timestamp(conversation)
            await session.commit()
            await session.refresh(asst)
            await bridge.emit(
                {
                    "type": "done",
                    "assistant": _msg_to_out(asst).model_dump(mode="json"),
                }
            )
        except asyncio.CancelledError:
            logger.warning(
                "agent_turn_background_cancelled turn_id=%s conversation_id=%s",
                turn.turn_id,
                conversation_id,
            )
            raise
        except Exception as e:
            logger.exception(
                "agent_turn_background_failed turn_id=%s conversation_id=%s",
                turn.turn_id,
                conversation_id,
            )
            try:
                conversation = await _load_conversation(session, conversation_id)
                asst = await _load_assistant(session, assistant_id)
                failed = await _persist_failed_assistant(
                    session,
                    conversation,
                    turn,
                    asst,
                    str(e),
                    acc,
                    existing_traces=existing_traces,
                    content_prefix=content_prefix,
                    exc=e,
                )
                await bridge.emit(_error_ndjson_line(str(e), failed))
            except Exception:
                logger.exception(
                    "agent_turn_background_persist_error_failed turn_id=%s",
                    turn.turn_id,
                )
        finally:
            await bridge.close()


def open_durable_project_stream(
    background_runner: Callable[[ClientBridge], Awaitable[None]],
) -> AsyncIterator[bytes]:
    """Spawn a disconnect-safe background turn and stream NDJSON while the client listens."""
    bridge = ClientBridge()

    async def _run() -> None:
        try:
            await background_runner(bridge)
        except Exception:
            logger.exception("durable_project_stream_task_crashed")
            await bridge.close()

    task = asyncio.create_task(_run())
    _track_background(task)

    async def gen() -> AsyncIterator[bytes]:
        try:
            async for chunk in _iter_ndjson_from_bridge(bridge):
                yield chunk
        finally:
            bridge.stop_listening()
            # Do not cancel `task` — that is the disconnect-safe guarantee.

    return gen()
