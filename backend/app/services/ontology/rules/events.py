"""Reading and triaging events — the read side of the Rules app.

An event is an `Event` object (no dataset), so this module is only what the UI needs on top of the
generic object API: filtering by subject/rule/state, and the few state moves a person actually makes
(acknowledge / dismiss / resolve / reopen). Everything else — links to the business object, graph
traversal, search — comes from the ontology for free.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.object_instance import ObjectInstance
from app.models.object_type import ObjectType

STATUSES = ("open", "acknowledged", "dismissed", "resolved")
#: Moving to one of these closes the event; moving back out of them reopens it.
CLOSING_STATUSES = ("dismissed", "resolved")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def event_out(instance: ObjectInstance) -> dict[str, Any]:
    data = dict(instance.data or {})
    return {
        "id": instance.id,
        "title": data.get("title"),
        "severity": data.get("severity"),
        "intent": data.get("intent"),
        "status": data.get("status"),
        "event_start_time": data.get("event_start_time"),
        "event_end_time": data.get("event_end_time"),
        "period_start": data.get("period_start"),
        "period_end": data.get("period_end"),
        "scope": data.get("scope"),
        "description": data.get("description"),
        "evidence": data.get("evidence"),
        "rule_id": data.get("rule_id"),
        "rule_object_id": data.get("rule_object_id"),
        "rule_version": data.get("rule_version"),
        "subject_type": data.get("subject_type"),
        "subject_id": data.get("subject_id"),
        "assignee": data.get("assignee"),
    }


def _filters(*, subject_type: str | None, subject_id: str | None, rule_id: str | None,
             rule_object_id: str | None, status: str | None, severity: str | None, open_only: bool) -> list:
    clauses = []
    if subject_type:
        clauses.append(ObjectInstance.data["subject_type"].astext == subject_type)
    if subject_id:
        clauses.append(ObjectInstance.data["subject_id"].astext == subject_id)
    if rule_id:
        clauses.append(ObjectInstance.data["rule_id"].astext == rule_id)
    if rule_object_id:
        clauses.append(ObjectInstance.data["rule_object_id"].astext == rule_object_id)
    if status:
        clauses.append(ObjectInstance.data["status"].astext == status)
    if severity:
        clauses.append(ObjectInstance.data["severity"].astext == severity)
    if open_only:
        clauses.append(ObjectInstance.data["event_end_time"].astext.is_(None))
    return clauses


async def list_events(
    db: AsyncSession,
    event_type: ObjectType,
    *,
    subject_type: str | None = None,
    subject_id: str | None = None,
    rule_id: str | None = None,
    rule_object_id: str | None = None,
    status: str | None = None,
    severity: str | None = None,
    open_only: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    clauses = _filters(
        subject_type=subject_type,
        subject_id=subject_id,
        rule_id=rule_id,
        rule_object_id=rule_object_id,
        status=status,
        severity=severity,
        open_only=open_only,
    )
    base = select(ObjectInstance).where(ObjectInstance.object_type_id == event_type.id, *clauses)
    total = await db.scalar(
        select(func.count()).select_from(base.subquery())
    ) or 0
    rows = (
        await db.execute(
            base.order_by(ObjectInstance.created_at.desc()).limit(max(1, min(limit, 200))).offset(max(0, offset))
        )
    ).scalars().all()
    return [event_out(row) for row in rows], int(total)


async def counts_by_subject(
    db: AsyncSession, event_type: ObjectType, *, subject_type: str | None = None
) -> list[dict[str, Any]]:
    """Open/total events per subject — one query, so a list page can show a badge without N+1."""
    clauses = []
    if subject_type:
        clauses.append(ObjectInstance.data["subject_type"].astext == subject_type)
    # One expression object for both the select list and GROUP BY: two separately built expressions
    # are sent as different bind parameters, which Postgres refuses to match.
    subject = ObjectInstance.data["subject_id"].astext
    ended = ObjectInstance.data["event_end_time"].astext
    rows = (
        await db.execute(
            select(
                subject.label("subject_id"),
                func.count().label("total"),
                func.count().filter(ended.is_(None)).label("open"),
            )
            .where(ObjectInstance.object_type_id == event_type.id, *clauses)
            .group_by(subject)
        )
    ).all()
    return [{"subject_id": r.subject_id, "total": int(r.total), "open": int(r.open)} for r in rows if r.subject_id]


async def transition(
    db: AsyncSession,
    instance: ObjectInstance,
    *,
    status: str | None = None,
    assignee: str | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    """Move one event's state. Closing sets an end time, reopening clears it."""
    data = dict(instance.data or {})
    if status is not None:
        if status not in STATUSES:
            raise ValueError(f"unsupported status '{status}'")
        data["status"] = status
        data["status_changed_at"] = _now()
        if status in CLOSING_STATUSES:
            # An open event stores `event_end_time: None`, so `setdefault` would keep the None.
            if not data.get("event_end_time"):
                data["event_end_time"] = _now()
            data["intent"] = "success" if status == "resolved" else data.get("intent") or "primary"
        else:
            data["event_end_time"] = None
    if assignee is not None:
        data["assignee"] = assignee or None
    if note is not None:
        data["status_note"] = note
    instance.data = data
    await db.flush()
    return event_out(instance)
