"""OpenAI-compat thinking / reasoning_content helpers (settings-agnostic)."""

from app.services.openai_compat.thinking import (
    chat_extra_body_disable_thinking,
    inject_reasoning_content_on_assistant_rows,
    make_langchain_chat_openai,
    use_reasoning_content_shim,
)

__all__ = [
    "chat_extra_body_disable_thinking",
    "inject_reasoning_content_on_assistant_rows",
    "make_langchain_chat_openai",
    "use_reasoning_content_shim",
]
