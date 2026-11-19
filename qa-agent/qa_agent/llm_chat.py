"""OpenAI-compatible ChatOpenAI setup aligned with wiki copilot (thinking / ``reasoning_content``)."""

from __future__ import annotations

import json
import logging
from typing import Any
from urllib.parse import urlparse

from langchain_core.language_models import LanguageModelInput
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from .config import settings

logger = logging.getLogger(__name__)


def use_llm_reasoning_content_shim(base_url: str) -> bool:
    """Mirror wiki ``_wiki_use_llm_reasoning_content_shim`` (see backend ``wiki_runner``)."""
    raw = (settings.llm_reasoning_content_shim or "").strip().lower()
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


class _ReasoningContentShimChatOpenAI(ChatOpenAI):
    """Inject ``reasoning_content`` on assistant rows for gateways that require the key in tool loops."""

    def _get_request_payload(
        self,
        input_: LanguageModelInput,
        *,
        stop: list[str] | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        payload = super()._get_request_payload(input_, stop=stop, **kwargs)
        if self._use_responses_api(payload):
            return payload
        raw_messages = payload.get("messages")
        if not isinstance(raw_messages, list):
            return payload
        for row in raw_messages:
            if isinstance(row, dict) and row.get("role") == "assistant":
                row["reasoning_content"] = row.get("reasoning_content") or ""
        return payload


def qa_agent_chat_extra_body(
    *, thinking: bool | None = None, fragments: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Vendor-specific body fields, merged into the request (this is what OpenAI SDK's `extra_body` does).

    The thinking toggle is spelled differently by every vendor, and a field the vendor does not know is *ignored*,
    not rejected — measured on `deepseek-flash`: `enable_thinking: false` still produced a reasoning chain, while
    `{"thinking": {"type": "disabled"}}` produced none. So the provider owns two fragments (`on` / `off`) and this
    function only merges the one the agent chose. No fragment means nothing is sent: a provider that cannot be
    asked should not look like a provider that was.
    """
    merged: dict[str, Any] = {}
    raw = (settings.llm_extra_body_json or "").strip()
    if raw:
        try:
            obj = json.loads(raw)
            if isinstance(obj, dict):
                merged.update(obj)
        except (json.JSONDecodeError, TypeError):
            logger.warning("OPENKMS_LLM_EXTRA_BODY is not valid JSON; ignoring")
    if thinking is not None and fragments:
        fragment = fragments.get("on" if thinking else "off")
        if isinstance(fragment, dict):
            merged.update(fragment)
    return merged


def make_qa_chat_openai(
    *,
    base_url: str,
    api_key: str,
    model_name: str,
    temperature: float,
    streaming: bool,
    thinking: bool | None = None,
    thinking_fragments: dict[str, Any] | None = None,
    reasoning_effort: str | None = None,
    top_p: float | None = None,
    max_tokens: int | None = None,
) -> ChatOpenAI:
    extra_body = qa_agent_chat_extra_body(thinking=thinking, fragments=thinking_fragments)
    common: dict[str, Any] = {
        "base_url": base_url,
        "api_key": api_key,
        "model": model_name,
        "temperature": temperature,
        "streaming": streaming,
        "extra_body": extra_body,
    }
    # `None` leaves the key out entirely so the gateway's own default applies; sending an explicit null is not
    # the same request.
    if top_p is not None:
        common["top_p"] = top_p
    if reasoning_effort and thinking:
        # A first-class OpenAI field, so it needs no fragment: every compatible vendor reads it at the top level
        # (DeepSeek and GLM take low/high/max). Dropped when thinking is off — asking for an effort level while
        # asking not to think is a contradiction, and the switch is the more specific statement.
        common["reasoning_effort"] = reasoning_effort
    if max_tokens is not None:
        # NOT as a first-class field: `langchain_openai` renames a top-level `max_tokens` to
        # `max_completion_tokens` before sending (checked on the wire, not from docs), and self-hosted
        # OpenAI-compatible gateways commonly read only `max_tokens`. Riding in `extra_body` keeps the key we claim
        # to send — and this is the last merge, so the agent's explicit value wins over a provider fragment.
        extra_body["max_tokens"] = max_tokens
    if use_llm_reasoning_content_shim(base_url):
        return _ReasoningContentShimChatOpenAI(**common)
    return ChatOpenAI(**common)


def _sanitize_aimessage_for_llm(msg: AIMessage) -> AIMessage:
    """Strip reasoning/thinking blocks LangChain may not round-trip (wiki ``_wiki_sanitize_aimessage_for_llm``)."""
    content: str | list[Any] | None = msg.content
    if isinstance(content, list):
        cleaned: list[Any] = []
        for block in content:
            if isinstance(block, dict):
                bt = block.get("type")
                if bt in ("reasoning", "thinking", "reasoning_content", "tool_call"):
                    continue
                if bt == "text" and isinstance(block.get("text"), str):
                    cleaned.append({"type": "text", "text": block["text"]})
                else:
                    cleaned.append(block)
            else:
                cleaned.append(block)
        if not cleaned:
            content = ""
        else:
            content = cleaned

    return AIMessage(
        content=content,
        tool_calls=list(msg.tool_calls) if msg.tool_calls else [],
        invalid_tool_calls=list(msg.invalid_tool_calls) if msg.invalid_tool_calls else [],
        id=msg.id,
        name=msg.name,
    )


def sanitize_messages_for_llm(messages: list[Any]) -> list[Any]:
    """Return a copy safe to send to the chat API after tool turns."""
    out: list[Any] = []
    for m in messages:
        if isinstance(m, AIMessage):
            out.append(_sanitize_aimessage_for_llm(m))
        else:
            out.append(m)
    return out


def conversation_rows_to_lc_messages(history: list[dict[str, str]]) -> list[BaseMessage]:
    """Turn ``{role, content}`` pairs into LangChain messages (string content only)."""
    out: list[BaseMessage] = []
    for row in history:
        role = row.get("role")
        text = row.get("content") or ""
        if role == "user":
            out.append(HumanMessage(content=text))
        elif role == "assistant":
            out.append(AIMessage(content=text))
    return out


def text_from_lc_content(content: Any) -> str:
    """Flatten LangChain message ``content`` (str or content blocks) to a single string."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for b in content:
            if isinstance(b, str):
                parts.append(b)
            elif isinstance(b, dict) and b.get("type") == "text" and isinstance(b.get("text"), str):
                parts.append(str(b["text"]))
        return "".join(parts)
    return str(content)


def build_messages_for_generate(
    *,
    context_prompt: str,
    conversation_history: list[dict[str, str]],
    question: str,
    existing_graph_messages: list[Any],
) -> list[Any]:
    """System + optional history + question, or full graph tail when tools already ran."""
    if existing_graph_messages:
        return sanitize_messages_for_llm(list(existing_graph_messages))

    messages: list[Any] = [SystemMessage(content=context_prompt)]
    messages.extend(conversation_rows_to_lc_messages(conversation_history))
    messages.append(HumanMessage(content=f"Question: {question}"))
    return messages
