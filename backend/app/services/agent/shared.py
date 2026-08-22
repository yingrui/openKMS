"""Shared constants and helpers extracted from wiki_runner / agent.py. Used across all agent surfaces."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from app.models.agent_models import AgentConversation, AgentMessage
from app.schemas.agent import AgentConversationResponse, AgentMessageItem

# Key used on AgentMessage.tool_calls JSONB to store tool trace transcripts.
WIKI_TOOL_TRANSCRIPTS_KEY = "wiki_tool_traces_v1"
_MAX_TOOL_OUTPUT_STORAGE = 48_000


def new_id() -> str:
    return str(uuid4())


def truncate_wiki_tool_output_for_storage(text: str, max_len: int = _MAX_TOOL_OUTPUT_STORAGE) -> str:
    t = text or ""
    suffix = "\n…[truncated for storage]"
    if len(t) + len(suffix) <= max_len:
        return t
    head = max_len - len(suffix)
    if head < 1:
        return suffix[:max_len]
    return t[:head] + suffix


def assistant_lc_content_from_db_row(content: str, tool_calls: list | dict | None) -> str:
    vis = (content or "").strip()
    traces: list[dict[str, str]] = []
    if isinstance(tool_calls, dict):
        raw = tool_calls.get(WIKI_TOOL_TRANSCRIPTS_KEY)
        if isinstance(raw, list):
            for item in raw:
                if (
                    isinstance(item, dict)
                    and isinstance(item.get("name"), str)
                    and isinstance(item.get("output"), str)
                ):
                    traces.append({"name": item["name"], "output": item["output"]})
    if not traces:
        return content or ""
    blocks = [f"### Tool `{t['name']}` result\n\n{t['output']}" for t in traces]
    section = "\n\n".join(blocks)
    if vis:
        return f"{vis}\n\n---\n\n{section}"
    return section


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
    import json
    return (json.dumps(payload, ensure_ascii=False, default=str) + "\n").encode()


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
