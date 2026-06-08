"""Project workspace backend: filesystem + shell scoped to one project folder."""

from __future__ import annotations

from pathlib import Path

from deepagents.backends import LocalShellBackend


def normalize_workspace_path(cwd: Path, key: str) -> str:
    """Map agent file paths to deepagents virtual paths under ``cwd``.

    With ``virtual_mode=True``, deepagents treats ``/foo`` as ``{cwd}/foo``, not as a
    host absolute path. Host absolutes under ``cwd`` (e.g. from ls/read output) must be
    rewritten to virtual form (``/.gitignore``). Virtual paths like ``/AGENTS.md`` are
    left unchanged.
    """
    raw = (key or "").strip()
    if not raw:
        return raw

    cwd_resolved = cwd.resolve()
    p = Path(raw)

    if p.is_absolute():
        try:
            rel = p.resolve().relative_to(cwd_resolved)
        except ValueError:
            rel = None
        if rel is not None:
            if rel.as_posix() == ".":
                return "/"
            return f"/{rel.as_posix()}"

        cwd_str = str(cwd_resolved)
        if raw == cwd_str:
            return "/"
        prefix = cwd_str.rstrip("/") + "/"
        if raw.startswith(prefix):
            rel_str = raw[len(prefix) :]
            return f"/{rel_str}" if rel_str else "/"

    return raw


class ProjectWorkspaceBackend(LocalShellBackend):
    """``LocalShellBackend`` with host-absolute paths under the project root normalized."""

    def _resolve_path(self, key: str) -> Path:
        return super()._resolve_path(normalize_workspace_path(self.cwd, key))
