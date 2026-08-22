"""Shared constants and helpers extracted from wiki_runner / agent.py. Used across all agent surfaces."""

from __future__ import annotations

from typing import Any

from app.models.agent_models import AgentConversation, AgentMessage
from app.schemas.agent import AgentConversationResponse, AgentMessageItem
from app.services.agent.ndjson import ndjson_line
from app.services.agent.tool_transcripts import (
    AGENT_TOOL_TRANSCRIPTS_KEY,
    WIKI_TOOL_TRANSCRIPTS_KEY,
    assistant_lc_content_from_db_row,
    truncate_tool_output_for_storage,
    truncate_wiki_tool_output_for_storage,
)

__all__ = [
    "AGENT_TOOL_TRANSCRIPTS_KEY",
    "WIKI_TOOL_TRANSCRIPTS_KEY",
    "assistant_lc_content_from_db_row",
    "truncate_tool_output_for_storage",
    "truncate_wiki_tool_output_for_storage",
    "new_id",
    "_conv_to_out",
    "_msg_to_out",
    "_maybe_set_conversation_title_from_first_user_message",
    "_bump_conversation_timestamp",
    "_ndjson_line",
    "_wiki_agent_chat_extra_body",
    "_wiki_use_llm_reasoning_content_shim",
]


def new_id() -> str:
    from uuid import uuid4

    return str(uuid4())


def _conv_to_out(c: AgentConversation) -> AgentConversationResponse:
    return AgentConversationResponse(
        id=c.id,
        user_sub=c.user_sub,
        surface=c.surface,
        context=c.context,
        title=c.title,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


def _msg_to_out(m: AgentMessage) -> AgentMessageItem:
    return AgentMessageItem(
        id=m.id,
        role=m.role,
        content=m.content,
        tool_calls=m.tool_calls,
        created_at=m.created_at,
    )


async def _maybe_set_conversation_title_from_first_user_message(
    db: Any, c: AgentConversation, first_user_text: str,
) -> None:
    """Set conversation title from the first user line when the row has no title yet."""
    if c.title and c.title.strip():
        return
    t = (first_user_text or "").strip().replace("\n", " ")
    if not t:
        return
    from sqlalchemy import func, select
    n = (
        await db.execute(
            select(func.count()).select_from(AgentMessage).where(AgentMessage.conversation_id == c.id)
        )
    ).scalar_one()
    if n != 1:
        return
    if len(t) > 80:
        t = t[:80]
    c.title = t


def _bump_conversation_timestamp(c: AgentConversation) -> None:
    from datetime import datetime, timezone
    c.updated_at = datetime.now(timezone.utc)


def _ndjson_line(payload: Any) -> bytes:
    return ndjson_line(payload)


def _wiki_agent_chat_extra_body() -> dict[str, Any]:
    """Wiki / designer paths: merge OPENKMS_AGENT_LLM_EXTRA_BODY; force thinking off."""
    from app.config import settings
    from app.services.openai_compat import chat_extra_body_disable_thinking

    return chat_extra_body_disable_thinking(settings.agent_llm_extra_body_json)


def _wiki_use_llm_reasoning_content_shim(base_url: str) -> bool:
    """Wiki / designer paths: whether to inject reasoning_content for this gateway."""
    from app.config import settings
    from app.services.openai_compat import use_reasoning_content_shim

    return use_reasoning_content_shim(
        base_url,
        setting=settings.agent_llm_reasoning_content_shim,
    )
