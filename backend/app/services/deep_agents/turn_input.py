"""Resolve LangGraph turn input from DB rows vs checkpoint thread state."""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

from app.models.agent_models import AgentMessage
from app.services.agent.tool_transcripts import assistant_lc_content_from_db_row

logger = logging.getLogger(__name__)


def _last_user_row(rows: list[AgentMessage]) -> AgentMessage | None:
    for row in reversed(rows):
        if row.role == "user":
            return row
    return None


def seed_messages_from_db(rows: list[AgentMessage]) -> list[BaseMessage]:
    """Seed a new checkpoint thread from persisted chat (UI replay), without tool traces.

    Tool outputs live in the LangGraph checkpoint after the first turn; re-injecting
    stored transcripts here duplicates context and inflates tokens.
    """
    out: list[BaseMessage] = []
    for row in rows:
        if row.role == "user":
            out.append(HumanMessage(content=row.content))
        elif row.role == "assistant":
            out.append(AIMessage(content=(row.content or "")))
    return out


async def resolve_turn_input_messages(
    agent: Any,
    cfg: dict[str, Any],
    db_rows: list[AgentMessage],
) -> list[BaseMessage]:
    """Checkpoint-first turn input for project workspace agents.

    - Existing LangGraph thread: append only the latest user message from DB.
    - New / reverted session (no checkpoint messages): seed from DB without tool traces.
    """
    snap = await agent.aget_state(cfg)
    state = dict(snap.values or {})
    checkpoint_messages = list(state.get("messages") or [])

    if checkpoint_messages:
        last_user = _last_user_row(db_rows)
        if last_user is None:
            logger.warning("resolve_turn_input_messages: checkpoint present but no user row in DB")
            return []
        logger.debug(
            "Checkpoint-first turn input: %s checkpoint messages, appending latest user row",
            len(checkpoint_messages),
        )
        return [HumanMessage(content=last_user.content)]

    seeded = seed_messages_from_db(db_rows)
    logger.debug("Seeding checkpoint thread from %s DB rows (%s LC messages)", len(db_rows), len(seeded))
    return seeded


def legacy_messages_from_db(rows: list[AgentMessage]) -> list[BaseMessage]:
    """Previous behavior: assistant rows include stored tool transcripts (wiki-style replay)."""
    out: list[BaseMessage] = []
    for row in rows:
        if row.role == "user":
            out.append(HumanMessage(content=row.content))
        elif row.role == "assistant":
            out.append(AIMessage(content=assistant_lc_content_from_db_row(row.content, row.tool_calls)))
    return out
