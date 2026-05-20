"""Request-scoped values (avoid putting secrets in LangChain ``RunnableConfig`` / Langfuse metadata)."""

from __future__ import annotations

from contextvars import ContextVar
from typing import Any

_access_token: ContextVar[str] = ContextVar("qa_agent_access_token", default="")


def set_request_access_token(token: str) -> Any:
    """Return an opaque handle for :func:`reset_request_access_token` (supports nesting)."""
    return _access_token.set(token or "")


def reset_request_access_token(handle: Any) -> None:
    _access_token.reset(handle)


def get_tool_access_token(config: dict[str, Any] | None) -> str:
    """Bearer token for backend calls from LangGraph tools.

    Prefer :func:`set_request_access_token` (not visible to Langfuse). Fall back to
    ``config['configurable']['access_token']`` for tests or ad-hoc invocations.
    """
    ctx = _access_token.get()
    if ctx:
        return ctx
    c = (config or {}).get("configurable") or {}
    if isinstance(c, dict):
        return (c.get("access_token") or "") if isinstance(c.get("access_token"), str) else ""
    return ""
