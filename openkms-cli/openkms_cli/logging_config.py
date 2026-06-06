"""CLI logging: stderr stream captured in job worker output (--- stderr ---)."""

from __future__ import annotations

import logging
import sys


def _resolve_log_level(raw: str | None) -> int:
    if not raw or not raw.strip():
        return logging.INFO
    name = raw.strip().upper()
    if hasattr(logging, "getLevelNamesMapping"):
        level = logging.getLevelNamesMapping().get(name)
        if isinstance(level, int):
            return level
    return int(getattr(logging, name, logging.INFO))


def configure_cli_logging(level: str | None = None) -> None:
    """
    Send ``openkms_cli.*`` log records to stderr (plain text, no Rich).

    Job worker captures subprocess stderr into Worker output. Idempotent.
    Level: ``OPENKMS_CLI_LOG_LEVEL`` (default INFO), or ``level`` when passed.
    """
    import os

    pkg_logger = logging.getLogger("openkms_cli")
    if pkg_logger.handlers:
        return

    resolved = _resolve_log_level(level or os.environ.get("OPENKMS_CLI_LOG_LEVEL"))
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(
        logging.Formatter("%(levelname)s openkms_cli.%(module)s: %(message)s")
    )
    pkg_logger.addHandler(handler)
    pkg_logger.setLevel(resolved)
    pkg_logger.propagate = False
