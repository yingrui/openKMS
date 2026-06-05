"""Plan mode: read-only agent configuration."""

from __future__ import annotations

from deepagents.middleware.filesystem import FilesystemPermission


def plan_mode_permissions() -> list[FilesystemPermission]:
    """Read-only filesystem for plan mode."""
    return [FilesystemPermission(operations=["read"], paths=["/"])]
