"""Langfuse integration for tracing LangGraph agent runs."""
from __future__ import annotations

import logging
import threading
import time
from typing import TYPE_CHECKING, Any, Literal

from .config import settings

if TYPE_CHECKING:
    from langfuse.langchain import CallbackHandler

logger = logging.getLogger(__name__)

_lf_probe_lock = threading.Lock()
# Circuit: unknown (no probe yet) | up (attach callback) | down (skip until _lf_next_probe_at)
_lf_circuit: Literal["unknown", "up", "down"] = "unknown"
_lf_next_probe_at: float = 0.0


def silence_otel_export_loggers() -> None:
    """OTLP export failures are non-fatal; keep logs readable when Langfuse is down."""
    for name in (
        "opentelemetry.exporter.otlp.proto.http.trace_exporter",
        "opentelemetry.exporter.otlp.proto.grpc.trace_exporter",
        "opentelemetry.sdk.trace",
        "opentelemetry.context",
    ):
        logging.getLogger(name).setLevel(logging.CRITICAL)


def _langfuse_base() -> str:
    return (settings.langfuse_base_url or "").strip().rstrip("/")


def _langfuse_health_ok() -> bool:
    base = _langfuse_base()
    url = f"{base}/api/public/health"
    try:
        import httpx

        resp = httpx.get(url, timeout=2.5)
        return resp.status_code < 500
    except Exception:
        return False


def _langfuse_circuit_allows_callback() -> bool:
    """Whether to attach Langfuse this turn: optional health gate with periodic recovery."""
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
                logger.info("Langfuse reachable at %s; tracing enabled.", base)
            _lf_circuit = "up"
            _lf_next_probe_at = 0.0
            return True

        interval = float(settings.langfuse_healthcheck_retry_seconds)
        if _lf_circuit != "down":
            logger.info(
                "Langfuse not reachable at %s; tracing disabled until next probe in %.0fs "
                "(LANGFUSE_HEALTHCHECK_RETRY_SECONDS).",
                base,
                interval,
            )
        else:
            logger.debug("Langfuse still unreachable at %s; backing off %.0fs.", base, interval)
        _lf_circuit = "down"
        _lf_next_probe_at = now + interval
        return False


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
    """Return a Langfuse CallbackHandler when fully configured, else None.

    Requires ``LANGFUSE_SECRET_KEY``, ``LANGFUSE_PUBLIC_KEY``, and **``LANGFUSE_BASE_URL``**
    (no implicit cloud default).

    When :attr:`settings.langfuse_healthcheck` is true, probes ``GET {base}/api/public/health``
    before creating the handler. While the host is down, all sessions skip Langfuse until the
    next probe after :attr:`settings.langfuse_healthcheck_retry_seconds`.
    """
    if not settings.langfuse_enabled:
        return None
    if not _langfuse_circuit_allows_callback():
        return None
    try:
        from langfuse.langchain import CallbackHandler

        return CallbackHandler()
    except ImportError:
        return None
