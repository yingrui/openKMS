"""Central logging setup for qa-agent."""

from __future__ import annotations

import logging
import sys


def _resolve_log_level(raw: str | None) -> int:
    if not raw or not str(raw).strip():
        return logging.INFO
    name = str(raw).strip().upper()
    level = logging.getLevelName(name)
    if isinstance(level, int):
        return level
    return logging.INFO


def configure_logging(level: str | int | None = None) -> None:
    """Configure root logging once (idempotent)."""
    if isinstance(level, int):
        resolved = level
    else:
        resolved = _resolve_log_level(level if level is not None else None)

    root = logging.getLogger()
    if getattr(configure_logging, "_configured", False):
        root.setLevel(resolved)
        return

    logging.basicConfig(
        level=resolved,
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
        stream=sys.stderr,
        force=True,
    )
    configure_logging._configured = True  # type: ignore[attr-defined]


def preview_text(text: str | None, max_len: int = 160) -> str:
    """Single-line preview for log lines."""
    t = (text or "").replace("\n", " ").strip()
    if len(t) <= max_len:
        return t
    return t[: max_len - 1] + "…"
