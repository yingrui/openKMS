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
    db: Any, c: AgentConversation,
) -> None:
    """Set conversation title from first user message content (if title is empty)."""
    from sqlalchemy import select
    r = await db.execute(
        select(AgentMessage)
        .where(AgentMessage.conversation_id == c.id, AgentMessage.role == "user")
        .order_by(AgentMessage.created_at.asc())
        .limit(1)
    )
    first = r.scalar_one_or_none()
    if first and not (c.title or "").strip():
        text = (first.content or "").strip().replace("\n", " ")
        c.title = text[:80] if len(text) > 80 else text


def _bump_conversation_timestamp(c: AgentConversation) -> None:
    from datetime import datetime, timezone
    c.updated_at = datetime.now(timezone.utc)


def _ndjson_line(payload: Any) -> bytes:
    import json
    return (json.dumps(payload, ensure_ascii=False, default=str) + "\n").encode()


def _wiki_agent_chat_extra_body() -> dict[str, Any]:
    from app.config import settings
    extra: dict[str, Any] = {}
    raw = (settings.agent_llm_extra_body_json or "").strip()
    if raw:
        import json
        try:
            extra.update(json.loads(raw))
        except json.JSONDecodeError:
            pass
    extra.setdefault("enable_thinking", False)
    return extra


def _wiki_use_llm_reasoning_content_shim(base_url: str) -> bool:
    from urllib.parse import urlparse
    from app.config import settings
    raw = (settings.agent_llm_reasoning_content_shim or "").strip().lower()
    if raw in ("0", "false", "no", "off"):
        return False
    if raw in ("1", "true", "yes", "on", "force"):
        return True
    try:
        host = (urlparse(base_url).hostname or "").lower()
    except ValueError:
        host = ""
    if host == "api.openai.com":
        return False
    return True


class _WikiReasoningContentShimChatOpenAI:
    """OpenAI chat-completions path only: inject reasoning_content on assistant dicts when the gateway requires it."""

    @staticmethod
    def patch():
        """Apply the reasoning content shim by monkey-patching ChatOpenAI."""
        from langchain_core.language_models import LanguageModelInput
        from langchain_openai import ChatOpenAI
        import types

        original = ChatOpenAI._get_request_payload

        def patched(self, input_: LanguageModelInput, *, stop=None, **kwargs):
            payload = original(self, input_, stop=stop, **kwargs)
            raw_messages = payload.get("messages")
            if isinstance(raw_messages, list):
                for row in raw_messages:
                    if isinstance(row, dict) and row.get("role") == "assistant":
                        row["reasoning_content"] = row.get("reasoning_content") or ""
            return payload

        ChatOpenAI._get_request_payload = patched
