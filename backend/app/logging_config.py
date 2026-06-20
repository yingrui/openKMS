"""Central logging setup for the openKMS backend API, worker, and scheduler."""

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


def configure_logging(
    *,
    backend_level: str | None = None,
    agent_level: str | None = None,
) -> None:
    """Configure root logging once (idempotent). Tune app and deep_agents loggers."""
    root_level = _resolve_log_level(backend_level)
    agent_resolved = _resolve_log_level(agent_level)

    root = logging.getLogger()
    if getattr(configure_logging, "_configured", False):
        root.setLevel(root_level)
        logging.getLogger("app.services.deep_agents").setLevel(agent_resolved)
        return

    logging.basicConfig(
        level=root_level,
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
        stream=sys.stderr,
        force=True,
    )
    logging.getLogger("app.services.deep_agents").setLevel(agent_resolved)
    configure_logging._configured = True  # type: ignore[attr-defined]
