"""Langfuse integration for tracing LangGraph agent runs."""
from typing import TYPE_CHECKING, Any

from .config import settings

if TYPE_CHECKING:
    from langfuse.langchain import CallbackHandler


def build_langgraph_trace_config(
    session_id: str | None,
    *,
    streaming: bool = False,
    include_callback: bool = True,
) -> dict[str, Any]:
    """LangChain/LangGraph ``config`` for ``invoke`` / ``astream_events`` with Langfuse session grouping.

    Langfuse reads ``langfuse_session_id`` and ``langfuse_tags`` from the **root** chain metadata
    (see ``langfuse.langchain.CallbackHandler._parse_langfuse_trace_attributes``).
    """
    cfg: dict[str, Any] = {}
    if include_callback:
        cb = get_langfuse_callback()
        if cb:
            cfg["callbacks"] = [cb]
    tags = ["qa-agent", "qa-stream" if streaming else "qa-sync"]
    meta: dict[str, Any] = {"langfuse_tags": tags}
    if session_id:
        meta["langfuse_session_id"] = session_id
    if cfg.get("callbacks") or session_id:
        cfg["metadata"] = meta
    return cfg


def get_langfuse_callback() -> "CallbackHandler | None":
    """Return a Langfuse CallbackHandler when ``LANGFUSE_*`` keys are set, else None.

    Use with :func:`build_langgraph_trace_config` so root ``metadata`` can include
    ``langfuse_session_id`` (Langfuse **Sessions** in the UI).
    """
    if not settings.langfuse_enabled:
        return None
    try:
        from langfuse.langchain import CallbackHandler

        return CallbackHandler()
    except ImportError:
        return None
