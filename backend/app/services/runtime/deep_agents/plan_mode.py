"""Plan mode: read-only agent configuration."""

from __future__ import annotations

from typing import Any

from deepagents.middleware.filesystem import FilesystemMiddleware

# deepagents 0.7 cannot combine FilesystemPermission with LocalShellBackend
# (execute). Hard read-only is a tools allowlist that replaces the default
# FilesystemMiddleware by name.
PLAN_MODE_FS_TOOLS: list[str] = ["ls", "read_file", "glob", "grep"]


def read_only_filesystem_middleware(backend: Any) -> FilesystemMiddleware:
    """Filesystem tools without write / edit / delete / execute."""
    return FilesystemMiddleware(backend=backend, tools=PLAN_MODE_FS_TOOLS)  # type: ignore[arg-type]
