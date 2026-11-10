"""Request-scoped values (avoid putting secrets in LangChain ``RunnableConfig`` / Langfuse metadata)."""

from __future__ import annotations

from contextvars import ContextVar
from typing import Any

_access_token: ContextVar[str] = ContextVar("qa_agent_access_token", default="")
_knowledge_base_id: ContextVar[str] = ContextVar("qa_agent_knowledge_base_id", default="")
#: The conversation this request belongs to — the key of its workspace directory. Never chosen by a tool call.
_session_id: ContextVar[str] = ContextVar("qa_agent_session_id", default="")


def set_request_access_token(token: str) -> Any:
    """Return an opaque handle for :func:`reset_request_access_token` (supports nesting)."""
    return _access_token.set(token or "")


def reset_request_access_token(handle: Any) -> None:
    _access_token.reset(handle)


def set_request_knowledge_base_id(kb_id: str) -> Any:
    return _knowledge_base_id.set(kb_id or "")


def reset_request_knowledge_base_id(handle: Any) -> None:
    _knowledge_base_id.reset(handle)


def set_request_session_id(session_id: str) -> Any:
    return _session_id.set(session_id or "")


def reset_request_session_id(handle: Any) -> None:
    _session_id.reset(handle)


def get_tool_session_id(config: dict[str, Any] | None = None) -> str:
    """Current session id — the workspace key. Tools read it; they cannot choose it."""
    ctx = _session_id.get()
    if ctx:
        return ctx
    c = (config or {}).get("configurable") or {}
    if isinstance(c, dict):
        v = c.get("session_id")
        return v if isinstance(v, str) else ""
    return ""


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


def get_tool_knowledge_base_id(config: dict[str, Any] | None = None) -> str:
    """Current KB id for scoped Catalog / ontology-group tools."""
    ctx = _knowledge_base_id.get()
    if ctx:
        return ctx
    c = (config or {}).get("configurable") or {}
    if isinstance(c, dict):
        v = c.get("knowledge_base_id")
        return v if isinstance(v, str) else ""
    return ""


_agents_md: ContextVar[str] = ContextVar("qa_agent_agents_md", default="")


def set_request_agents_md(text: str) -> Any:
    return _agents_md.set(text or "")


def reset_request_agents_md(handle: Any) -> None:
    _agents_md.reset(handle)


def get_tool_agents_md(config: dict[str, Any] | None = None) -> str | None:
    """The KB's `AGENTS.md` text for this request, or None. Read from the context so a tool call cannot supply its own."""
    ctx = _agents_md.get()
    if ctx:
        return ctx
    c = (config or {}).get("configurable") or {}
    if isinstance(c, dict):
        v = c.get("agents_md")
        return v if isinstance(v, str) and v.strip() else None
    return None


_sandbox: ContextVar[dict] = ContextVar("qa_agent_sandbox", default={})


def set_request_sandbox(settings: dict) -> Any:
    return _sandbox.set(settings or {})


def reset_request_sandbox(handle: Any) -> None:
    _sandbox.reset(handle)


def get_tool_sandbox(config: dict[str, Any] | None = None) -> dict:
    """The sandbox settings for this request. Read from the context so a tool call cannot widen its own limits."""
    ctx = _sandbox.get()
    if ctx:
        return dict(ctx)
    c = (config or {}).get("configurable") or {}
    if isinstance(c, dict) and isinstance(c.get("sandbox"), dict):
        return dict(c["sandbox"])
    return {}
