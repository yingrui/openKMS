"""Project Deep Agents ChatOpenAI setup (thinking / reasoning_content).

Independent of Wiki Copilot — binds Deep Agents settings to openai_compat primitives.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.config import settings
from app.services.platform.openai_compat import (
    chat_extra_body,
    make_langchain_chat_openai,
    use_reasoning_content_shim,
)


def normalize_openai_base_url(url: str) -> str:
    b = (url or "").rstrip("/")
    return b if b.endswith("/v1") else f"{b}/v1"


def deep_agent_chat_extra_body(thinking_fragments: dict[str, Any] | None = None) -> dict[str, Any]:
    """Deployment extras plus this provider's "thinking off" fragment (agent turns answer, they do not reason aloud)."""
    fragments = thinking_fragments or {}
    return chat_extra_body(settings.agent_llm_extra_body_json, off_fragment=fragments.get("off"))


def deep_agent_use_reasoning_content_shim(base_url: str) -> bool:
    return use_reasoning_content_shim(
        base_url,
        setting=settings.agent_llm_reasoning_content_shim,
    )


def build_deep_agent_chat_openai(
    *,
    base_url: str,
    api_key: str,
    model_name: str,
    temperature: float,
    streaming: bool,
    max_tokens: int | None = None,
    timeout: httpx.Timeout | None = None,
    thinking_fragments: dict[str, Any] | None = None,
) -> Any:
    return make_langchain_chat_openai(
        base_url=base_url,
        api_key=api_key,
        model_name=model_name,
        temperature=temperature,
        streaming=streaming,
        max_tokens=max_tokens,
        timeout=timeout,
        extra_body=deep_agent_chat_extra_body(thinking_fragments),
        use_shim=deep_agent_use_reasoning_content_shim(base_url),
    )
