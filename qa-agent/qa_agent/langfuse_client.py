"""Langfuse integration for tracing LangGraph agent runs."""
from typing import TYPE_CHECKING

from .config import settings

if TYPE_CHECKING:
    from langfuse.langchain import CallbackHandler


def get_langfuse_callback() -> "CallbackHandler | None":
    """Return a Langfuse CallbackHandler when configured, else None.

    Use with ``agent.invoke(config={"callbacks": [...]})``. For ``astream_events``,
    attach only when ``LANGFUSE_TRACE_STREAMING=true`` (see ``agent.astream_agent_ndjson``):
    the default avoids OpenTelemetry context detach errors with async streaming.
    """
    if not settings.langfuse_enabled:
        return None
    try:
        from langfuse.langchain import CallbackHandler

        return CallbackHandler()
    except ImportError:
        return None
