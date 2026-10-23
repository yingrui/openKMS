"""Recording mutations — the pure part (what the path means) and the write.

The middleware calls this after the response, with its **own** session: an audit write must not join the
request's transaction (a rollback would erase the record of the attempt) and must never fail the request
(an audit outage must not turn a successful write into a 500).
"""
from __future__ import annotations

import logging
import re
from typing import Any

from sqlalchemy.exc import SQLAlchemyError

from app.database import async_session_maker
from app.models.audit_event import AuditEvent

logger = logging.getLogger(__name__)

MUTATING = frozenset({"POST", "PUT", "PATCH", "DELETE"})

#: Our ids are UUIDs; a path segment that looks like one is the subject, anything else is a noun
#: (`/api/system/settings` reports `system` and no id, which is honest enough for a log).
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def audit_target(path: str) -> tuple[str | None, str | None]:
    """The resource a path acts on — coarse on purpose: a log needs a subject, not a router."""
    segments = [s for s in path.split("?")[0].split("/") if s]
    if segments and segments[0] == "api":
        segments = segments[1:]
    if not segments:
        return None, None
    resource_type = segments[0]
    resource_id = segments[1] if len(segments) > 1 and _UUID.match(segments[1]) else None
    return resource_type, resource_id


async def record_audit_event(
    *,
    method: str,
    path: str,
    status_code: int,
    actor_sub: str | None,
    actor_name: str | None,
    auth_mode: str | None,
    detail: dict[str, Any] | None = None,
    response_id: str | None = None,
    response_label: str | None = None,
) -> None:
    """Write one event. Narrow failures are swallowed **loudly**: the request already answered.

    `response_id` wins over the path: a create has no id in its URL, and the object it returned *is* the
    subject. This is how the log stays general — a route that returns `{"id": …}` needs no special case.
    """
    resource_type, path_id = audit_target(path)
    resource_id = response_id or path_id
    try:
        async with async_session_maker() as db:
            db.add(
                AuditEvent(
                    method=method,
                    path=path,
                    status_code=status_code,
                    actor_sub=actor_sub,
                    actor_name=actor_name,
                    auth_mode=auth_mode,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    resource_label=response_label,
                    detail=detail,
                )
            )
            await db.commit()
    except (SQLAlchemyError, OSError) as exc:
        logger.error("audit event not recorded (%s %s): %s", method, path, exc)


def job_audit_fields(task_name: str, job_id: int | str | None) -> dict[str, Any]:
    """The audit fields for one worker run — pure, so the mapping is testable.

    A job has no HTTP verb and no URL, so it records `JOB` and a `job/<task>` path, with the id as the
    subject. The *enqueue* was an HTTP call and is already in the log with an actor; this row is the other
    half of that pair, and `detail.job_id` joins them.
    """
    resource_id = str(job_id) if job_id is not None else None
    return {
        "method": "JOB",
        "path": f"job/{task_name}",
        "resource_type": "jobs",
        "resource_id": resource_id,
        "detail": {"job_id": resource_id} if resource_id else None,
    }
