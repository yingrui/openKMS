"""The per-session workspace: one directory per conversation.

The project runtime gives every project one directory (`project_fs.project_root`). The KB agent needs the same at **session**
granularity, because a conversation is the unit a user works in: two users, or one user twice, must not see each other's
files.

This module is the directory layer only, and it says so plainly: **a directory is not a boundary.** It keeps paths inside
one root and stops a path from escaping; it does not stop a *process* from reading the rest of the host. That distinction is
in `docs/features/knowledge-base-qa-agent.md`, and it is why file tools can ship before code execution does.

Shape::

    {sessions_root}/{kb_id}/{session_id}/
      AGENTS.md          KB-wide rules, copied in at session creation
      .openkms/skills/   the KB's instructional skills — read-only
      uploads/           data the user attached
      out/               artifacts the agent produced
      tmp/
"""
from __future__ import annotations

import mimetypes
import re
import shutil
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

__all__ = [
    "MAX_READ_BYTES",
    "READ_ONLY_DIRS",
    "SessionPathError",
    "SessionQuotaExceeded",
    "SCAFFOLD_DIRS",
    "ensure_session_dir",
    "list_dir",
    "read_file",
    "reclaim_expired",
    "remove_session",
    "resolve_session_path",
    "session_root",
    "session_usage_bytes",
    "write_file",
]

#: Anything larger comes back as `is_binary` with a size, rather than into a prompt.
MAX_READ_BYTES = 2_000_000

#: Directories the agent may read but never write. Installed skills are the KB's, not the conversation's.
READ_ONLY_DIRS = frozenset({".openkms"})

#: Created lazily on first use.
SCAFFOLD_DIRS = ("uploads", "out", "tmp")

#: Ids become path segments, so they are validated as such rather than trusted.
_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")


class SessionPathError(ValueError):
    """A path or id that would escape the session directory."""


class SessionQuotaExceeded(ValueError):
    """A write that would take the session past its disk quota."""


@dataclass(frozen=True)
class _Roots:
    root: Path
    sessions: Path


def _settings() -> Any:
    from .config import settings

    return settings


def _checked_id(value: str, what: str) -> str:
    text = (value or "").strip()
    if not _ID.match(text) or text in (".", ".."):
        raise SessionPathError(f"Invalid {what}.")
    return text


def session_root(kb_id: str, session_id: str) -> Path:
    """The directory for one conversation, created on demand."""
    settings = _settings()
    sessions = Path(settings.sessions_root).expanduser().resolve()
    path = (sessions / _checked_id(kb_id, "knowledge base id") / _checked_id(session_id, "session id")).resolve()
    # Belt and braces: the ids are already charset-limited, and this catches a settings root that is itself a symlink.
    if not str(path).startswith(str(sessions)):
        raise SessionPathError("Session path escapes the sessions root.")
    return path


def resolve_session_path(kb_id: str, session_id: str, relative: str = "") -> Path:
    """A path inside one session directory. ``..`` and absolute paths are refused, not normalised away."""
    root = session_root(kb_id, session_id)
    # A leading "/" is a *virtual* root, not the host's: the agent's file tools address files as `/out/chart.csv`
    # (`deepagents` virtual mode). Stripping it keeps that idiom working and can never escape — `/etc/passwd` becomes
    # `<session>/etc/passwd`, which does not exist.
    rel = (relative or "").strip().replace("\\", "/").lstrip("/")
    if rel and ".." in Path(rel).parts:
        raise SessionPathError("Path traversal is not allowed.")
    target = (root / rel).resolve() if rel else root
    if target != root and not str(target).startswith(str(root) + "/"):
        raise SessionPathError("Path escapes the session directory.")
    return target


def _relative(root: Path, path: Path) -> str:
    return str(path.relative_to(root)).replace("\\", "/")


def ensure_session_dir(kb_id: str, session_id: str, *, agents_md: str | None = None) -> Path:
    """Create the session directory and its subdirectories. Idempotent; never overwrites AGENTS.md."""
    root = session_root(kb_id, session_id)
    for name in SCAFFOLD_DIRS:
        (root / name).mkdir(parents=True, exist_ok=True)
    (root / ".openkms" / "skills").mkdir(parents=True, exist_ok=True)
    if agents_md:
        path = root / "AGENTS.md"
        if not path.exists():
            path.write_text(agents_md, encoding="utf-8")
    return root


def _refuse_read_only(kb_id: str, session_id: str, target: Path) -> None:
    root = session_root(kb_id, session_id)
    if target == root:
        return
    first = Path(_relative(root, target)).parts[0]
    if first in READ_ONLY_DIRS:
        raise SessionPathError(f"{first}/ is read-only.")


def session_usage_bytes(kb_id: str, session_id: str) -> int:
    """Bytes used by the session directory (0 when it does not exist yet)."""
    root = session_root(kb_id, session_id)
    if not root.is_dir():
        return 0
    return sum(p.stat().st_size for p in root.rglob("*") if p.is_file())


def _check_quota(kb_id: str, session_id: str, incoming: int) -> None:
    limit_mb = int(getattr(_settings(), "session_disk_mb", 0) or 0)
    if limit_mb <= 0:
        return
    if session_usage_bytes(kb_id, session_id) + incoming > limit_mb * 1024 * 1024:
        raise SessionQuotaExceeded(f"Session workspace is over its {limit_mb} MB quota.")


def list_dir(kb_id: str, session_id: str, relative: str = "") -> list[dict[str, Any]]:
    root = session_root(kb_id, session_id)
    path = resolve_session_path(kb_id, session_id, relative)
    if not path.exists():
        return []
    if not path.is_dir():
        raise SessionPathError("Not a directory.")
    entries: list[dict[str, Any]] = []
    for child in sorted(path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        stat = child.stat()
        entries.append(
            {
                "name": child.name,
                "path": _relative(root, child),
                "is_dir": child.is_dir(),
                "size": None if child.is_dir() else stat.st_size,
                "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            }
        )
    return entries


def read_file(kb_id: str, session_id: str, relative: str) -> dict[str, Any]:
    """Text when it is text and small enough; otherwise a stub with the size and mime, never the bytes."""
    path = resolve_session_path(kb_id, session_id, relative)
    if not path.is_file():
        raise SessionPathError("File not found.")
    size = path.stat().st_size
    mime, _ = mimetypes.guess_type(path.name)
    textual = mime is None or mime.startswith("text/") or mime in (
        "application/json",
        "application/xml",
        "application/javascript",
        "application/x-yaml",
    )
    if not textual or size > MAX_READ_BYTES:
        return {"path": relative, "content": None, "is_binary": True, "size": size, "mime": mime}
    try:
        content = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return {"path": relative, "content": None, "is_binary": True, "size": size, "mime": mime}
    return {"path": relative, "content": content, "is_binary": False, "size": size, "mime": mime}


def write_file(kb_id: str, session_id: str, relative: str, content: str) -> dict[str, Any]:
    """Write text into the session. Refused under `.openkms/`, and refused when it would break the quota."""
    ensure_session_dir(kb_id, session_id)
    path = resolve_session_path(kb_id, session_id, relative)
    if path.is_dir():
        raise SessionPathError("Path is a directory.")
    _refuse_read_only(kb_id, session_id, path)
    data = content.encode("utf-8")
    limit_mb = int(getattr(_settings(), "session_upload_max_mb", 0) or 0)
    if limit_mb > 0 and len(data) > limit_mb * 1024 * 1024:
        raise SessionQuotaExceeded(f"A single file may not exceed {limit_mb} MB.")
    existing = path.stat().st_size if path.is_file() else 0
    _check_quota(kb_id, session_id, max(0, len(data) - existing))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return {"path": relative, "size": len(data)}


def remove_session(kb_id: str, session_id: str) -> bool:
    """Delete the whole session directory. True when something was removed."""
    root = session_root(kb_id, session_id)
    if not root.is_dir():
        return False
    shutil.rmtree(root)
    return True


def reclaim_expired(ttl_minutes: int, *, now: float | None = None) -> list[str]:
    """Delete session directories untouched for longer than ``ttl_minutes``. Returns the removed paths.

    Callers run this on a schedule, not per request: a session directory has no writer to notice its own expiry.
    """
    if ttl_minutes <= 0:
        return []
    sessions = Path(_settings().sessions_root).expanduser().resolve()
    if not sessions.is_dir():
        return []
    cutoff = (now if now is not None else time.time()) - ttl_minutes * 60
    removed: list[str] = []
    for kb_dir in sorted(p for p in sessions.iterdir() if p.is_dir()):
        for session_dir in sorted(p for p in kb_dir.iterdir() if p.is_dir()):
            newest = max((p.stat().st_mtime for p in session_dir.rglob("*")), default=session_dir.stat().st_mtime)
            if newest < cutoff:
                shutil.rmtree(session_dir)
                removed.append(str(session_dir))
        if not any(kb_dir.iterdir()):
            kb_dir.rmdir()
    return removed
