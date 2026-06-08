"""Human-in-the-loop interrupt configuration for project agents."""

from __future__ import annotations

from typing import Any

# Tools that require user approval before execution.
# Project workspace file tools (write_file, edit_file) are auto-approved — the
# workspace is the user's project sandbox. openKMS mutation tools and shell stay gated.
DEFAULT_INTERRUPT_ON: dict[str, bool | dict[str, Any]] = {
    "execute": True,
    "upsert_wiki_page": True,
    "upload_document": True,
    "create_article": True,
}


def interrupt_map(*, plan_mode: bool) -> dict[str, bool | dict[str, Any]]:
    if plan_mode:
        return {}
    return dict(DEFAULT_INTERRUPT_ON)
