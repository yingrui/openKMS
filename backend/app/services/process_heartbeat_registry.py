"""In-memory process heartbeat registry (no historical persistence)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Literal

ProcessRole = Literal["worker", "scheduler"]

ONLINE_THRESHOLD_SECONDS = 120
PRUNE_THRESHOLD_SECONDS = 600


@dataclass
class ProcessHeartbeatEntry:
    role: ProcessRole
    instance_id: str
    reported_at: datetime
    message: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)


_lock = Lock()
_entries: dict[tuple[ProcessRole, str], ProcessHeartbeatEntry] = {}


def upsert(
    role: ProcessRole,
    instance_id: str,
    *,
    message: str | None = None,
    meta: dict[str, Any] | None = None,
) -> None:
    key = (role, instance_id.strip())
    entry = ProcessHeartbeatEntry(
        role=role,
        instance_id=instance_id.strip(),
        reported_at=datetime.now(timezone.utc),
        message=message,
        meta=meta or {},
    )
    with _lock:
        prune_stale_unlocked()
        _entries[key] = entry


def prune_stale() -> None:
    with _lock:
        prune_stale_unlocked()


def prune_stale_unlocked() -> None:
    now = datetime.now(timezone.utc)
    stale_keys = [
        key
        for key, entry in _entries.items()
        if (now - entry.reported_at).total_seconds() > PRUNE_THRESHOLD_SECONDS
    ]
    for key in stale_keys:
        del _entries[key]


def list_entries() -> list[ProcessHeartbeatEntry]:
    with _lock:
        prune_stale_unlocked()
        return list(_entries.values())


def _age_seconds(reported_at: datetime) -> float:
    return (datetime.now(timezone.utc) - reported_at).total_seconds()


def instance_status(reported_at: datetime) -> str:
    age = _age_seconds(reported_at)
    if age <= ONLINE_THRESHOLD_SECONDS:
        return "ok"
    return "error"


def format_last_seen_message(reported_at: datetime) -> str:
    age = int(_age_seconds(reported_at))
    if age < 60:
        return f"Last heartbeat {age}s ago"
    minutes = age // 60
    return f"Offline (no heartbeat for {minutes}m)"


def reset_for_tests() -> None:
    with _lock:
        _entries.clear()
