"""Optional Langfuse tracing for the embedded wiki LangGraph agent (same env vars as qa-agent)."""

from __future__ import annotations

import os
from typing import Any

from app.config import settings


def wiki_langfuse_enabled() -> bool:
    return bool((settings.langfuse_secret_key or "").strip() and (settings.langfuse_public_key or "").strip())


def get_wiki_langfuse_callback() -> Any:
    """Return a LangChain callback for Langfuse when keys are configured, else ``None``."""
    if not wiki_langfuse_enabled():
        return None
    sk = (settings.langfuse_secret_key or "").strip()
    pk = (settings.langfuse_public_key or "").strip()
    host = (settings.langfuse_base_url or "").strip()
    # CallbackHandler reads the global Langfuse client; mirror qa-agent env wiring.
    os.environ.setdefault("LANGFUSE_SECRET_KEY", sk)
    os.environ.setdefault("LANGFUSE_PUBLIC_KEY", pk)
    if host:
        os.environ.setdefault("LANGFUSE_HOST", host)
        os.environ.setdefault("LANGFUSE_BASE_URL", host)
    try:
        from langfuse.langchain import CallbackHandler

        return CallbackHandler(public_key=pk or None)
    except ImportError:
        return None


def build_wiki_langgraph_runnable_config(
    *,
    recursion_limit: int,
    conversation_id: str,
    session_id: str | None,
    streaming: bool,
) -> dict[str, Any]:
    """RunnableConfig for ``ainvoke`` / ``astream_events`` (callbacks + Langfuse session metadata)."""
    cfg: dict[str, Any] = {"recursion_limit": recursion_limit}
    sid = (session_id or "").strip() or conversation_id
    tags = ["wiki-copilot", "wiki-stream" if streaming else "wiki-sync"]
    cfg["metadata"] = {"langfuse_session_id": sid, "langfuse_tags": tags}
    use_cb = get_wiki_langfuse_callback()
    if use_cb and (settings.langfuse_trace_streaming or not streaming):
        cfg["callbacks"] = [use_cb]
    return cfg
