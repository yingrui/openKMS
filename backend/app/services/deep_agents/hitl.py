"""Human-in-the-loop interrupt configuration for project agents."""

from __future__ import annotations

from typing import Any

# Project agents reach openKMS via installed skills (shell CLI), not built-in HTTP tools.
# Workspace file tools and shell run without approval; add tool names here if HITL is needed later.
DEFAULT_INTERRUPT_ON: dict[str, bool | dict[str, Any]] = {}


def interrupt_map(
    *,
    plan_mode: bool,
    scheduled_run: bool = False,
) -> dict[str, bool | dict[str, Any]] | None:
    if plan_mode or scheduled_run:
        return None
    return dict(DEFAULT_INTERRUPT_ON) or None
