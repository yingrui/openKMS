"""Project Deep Agents ChatOpenAI setup (thinking / reasoning_content).

Independent of Wiki Copilot — binds Deep Agents settings to openai_compat primitives.
"""

from __future__ import annotations

from typing import Any

from app.config import settings
from app.services.openai_compat import (
    chat_extra_body_disable_thinking,
    make_langchain_chat_openai,
    use_reasoning_content_shim,
)


def normalize_openai_base_url(url: str) -> str:
    b = (url or "").rstrip("/")
    return b if b.endswith("/v1") else f"{b}/v1"


def deep_agent_chat_extra_body() -> dict[str, Any]:
    return chat_extra_body_disable_thinking(settings.agent_llm_extra_body_json)


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
) -> Any:
    return make_langchain_chat_openai(
        base_url=base_url,
        api_key=api_key,
        model_name=model_name,
        temperature=temperature,
        streaming=streaming,
        max_tokens=max_tokens,
        extra_body=deep_agent_chat_extra_body(),
        use_shim=deep_agent_use_reasoning_content_shim(base_url),
    )
