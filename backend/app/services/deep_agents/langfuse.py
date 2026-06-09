"""Optional Langfuse tracing for Deep Agents (same env vars and semantics as qa-agent)."""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import TYPE_CHECKING, Any, Literal

import httpx

from app.config import settings

if TYPE_CHECKING:
    from langfuse.langchain import CallbackHandler

logger = logging.getLogger(__name__)

_lf_probe_lock = threading.Lock()
_lf_circuit: Literal["unknown", "up", "down"] = "unknown"
_lf_next_probe_at: float = 0.0
_otel_silenced = False


def _silence_otel_export_loggers_once() -> None:
    global _otel_silenced
    if _otel_silenced:
        return
    _otel_silenced = True
    for name in (
        "opentelemetry.exporter.otlp.proto.http.trace_exporter",
        "opentelemetry.exporter.otlp.proto.grpc.trace_exporter",
        "opentelemetry.sdk.trace",
        "opentelemetry.context",
    ):
        logging.getLogger(name).setLevel(logging.CRITICAL)


def _langfuse_base() -> str:
    return (settings.langfuse_base_url or "").strip().rstrip("/")


def _ensure_langfuse_env() -> None:
    sk = (settings.langfuse_secret_key or "").strip()
    pk = (settings.langfuse_public_key or "").strip()
    host = _langfuse_base()
    os.environ.setdefault("LANGFUSE_SECRET_KEY", sk)
    os.environ.setdefault("LANGFUSE_PUBLIC_KEY", pk)
    if host:
        os.environ.setdefault("LANGFUSE_HOST", host)
        os.environ.setdefault("LANGFUSE_BASE_URL", host)


def _langfuse_health_ok() -> bool:
    url = f"{_langfuse_base()}/api/public/health"
    try:
        resp = httpx.get(url, timeout=2.5)
        return resp.status_code < 500
    except Exception:
        return False


def _langfuse_circuit_allows_callback() -> bool:
    global _lf_circuit, _lf_next_probe_at
    if not settings.langfuse_enabled:
        return False
    if not settings.langfuse_healthcheck:
        return True

    now = time.monotonic()
    with _lf_probe_lock:
        if _lf_circuit == "up":
            return True
        if _lf_circuit == "down" and now < _lf_next_probe_at:
            return False

        base = _langfuse_base()
        ok = _langfuse_health_ok()
        if ok:
            if _lf_circuit != "up":
                logger.info("Langfuse reachable at %s; Deep Agents tracing enabled.", base)
            _lf_circuit = "up"
            _lf_next_probe_at = 0.0
            return True

        interval = float(settings.langfuse_healthcheck_retry_seconds)
        if _lf_circuit != "down":
            logger.info(
                "Langfuse not reachable at %s; Deep Agents tracing disabled until next probe in %.0fs "
                "(LANGFUSE_HEALTHCHECK_RETRY_SECONDS).",
                base,
                interval,
            )
        else:
            logger.debug("Langfuse still unreachable at %s; backing off %.0fs.", base, interval)
        _lf_circuit = "down"
        _lf_next_probe_at = now + interval
        return False


def get_deep_agent_langfuse_callback() -> CallbackHandler | None:
    """Return a Langfuse callback when all three env vars are set; else ``None``."""
    if not _langfuse_circuit_allows_callback():
        return None
    _ensure_langfuse_env()
    _silence_otel_export_loggers_once()
    try:
        from langfuse.langchain import CallbackHandler

        return CallbackHandler()
    except ImportError:
        return None


def build_deep_agent_langgraph_config(
    *,
    conversation_id: str,
    session_id: str | None = None,
    streaming: bool = False,
    plan_mode: bool = False,
    thread_id: str | None = None,
) -> dict[str, Any]:
    """RunnableConfig for ``ainvoke`` / ``astream_events`` with optional Langfuse session metadata."""
    cfg: dict[str, Any] = {
        "configurable": {"thread_id": thread_id or conversation_id},
        "recursion_limit": settings.agent_recursion_limit,
    }
    sid = (session_id or "").strip() or conversation_id
    tags = ["deep-agent", "project-stream" if streaming else "project-sync"]
    if plan_mode:
        tags.append("plan-mode")
    cfg["metadata"] = {"langfuse_session_id": sid, "langfuse_tags": tags}
    use_cb = get_deep_agent_langfuse_callback()
    if use_cb and (settings.langfuse_trace_streaming or not streaming):
        cfg["callbacks"] = [use_cb]
    return cfg
