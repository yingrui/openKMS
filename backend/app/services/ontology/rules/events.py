"""Reading and triaging alerts — the read side of the reconciliation app.

An alert is a `metric_events` row: it names the rule that raised it, the metric, the scope and the period,
and it has two timestamps (empty end = still open). What lives here is exactly what the UI needs — filtering
and the two moves a person makes (resolve / dismiss, and reopen).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.metric_rule import MetricEvent, MetricRule

#: `acknowledged` is no longer produced — it changed nothing (no block, no notification).
STATUSES = ("open", "dismissed", "resolved")
#: Moving to one of these closes the alert; moving back out of them reopens it.
CLOSING_STATUSES = ("dismissed", "resolved")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def event_out(event: MetricEvent, *, rule_slug: str | None = None) -> dict[str, Any]:
    payload = event.payload()
    payload["rule_id"] = rule_slug
    return payload


def _filters(
    *,
    subject_type: str | None,
    subject_id: str | None,
    rule_id: str | None,
    rule_object_id: str | None,
    status: str | None,
    severity: str | None,
    open_only: bool,
) -> list:
    clauses = []
    if subject_type and subject_type != "metric":
        # Alerts are about metrics only; a dataset filter matches nothing.
        clauses.append(MetricEvent.id == "")
    if subject_id:
        clauses.append(MetricEvent.metric_id == subject_id)
    if rule_object_id:
        clauses.append(MetricEvent.rule_id == rule_object_id)
    if rule_id:
        clauses.append(
            MetricEvent.rule_id.in_(select(MetricRule.id).where(MetricRule.slug == rule_id))
        )
    if status:
        clauses.append(MetricEvent.status == status)
    if severity:
        clauses.append(MetricEvent.severity == severity)
    if open_only:
        clauses.append(MetricEvent.event_end_time.is_(None))
    return clauses


async def list_events(
    db: AsyncSession,
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
    base = select(MetricEvent, MetricRule.slug).join(MetricRule, MetricRule.id == MetricEvent.rule_id).where(*clauses)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = (
        await db.execute(
            base.order_by(MetricEvent.event_start_time.desc())
            .limit(max(1, min(limit, 200)))
            .offset(max(0, offset))
        )
    ).all()
    return [event_out(event, rule_slug=slug) for event, slug in rows], int(total)


async def counts_by_subject(
    db: AsyncSession, *, subject_type: str | None = None
) -> list[dict[str, Any]]:
    """Open/total alerts per metric — one query, so a list page can show a badge without N+1."""
    if subject_type and subject_type != "metric":
        return []
    rows = (
        await db.execute(
            select(
                MetricEvent.metric_id.label("subject_id"),
                func.count().label("total"),
                func.count().filter(MetricEvent.event_end_time.is_(None)).label("open"),
            ).group_by(MetricEvent.metric_id)
        )
    ).all()
    return [
        {"subject_id": r.subject_id, "total": int(r.total), "open": int(r.open)}
        for r in rows
        if r.subject_id
    ]


async def transition(
    db: AsyncSession,
    event: MetricEvent,
    *,
    status: str | None = None,
    assignee: str | None = None,
    note: str | None = None,
    rule_slug: str | None = None,
) -> dict[str, Any]:
    """Move one alert's state. Closing sets an end time, reopening clears it."""
    if status is not None:
        if status not in STATUSES:
            raise ValueError(f"unsupported status '{status}'")
        event.status = status
        if status in CLOSING_STATUSES:
            if not event.event_end_time:
                event.event_end_time = _now()
            event.intent = "success" if status == "resolved" else (event.intent or "primary")
        else:
            event.event_end_time = None
    if assignee is not None:
        event.assignee = assignee or None
    if note is not None:
        # Notes have no column of their own: they are part of the evidence trail.
        event.evidence = {**(event.evidence or {}), "status_note": note, "status_changed_at": _now()}
    await db.flush()
    return event_out(event, rule_slug=rule_slug)
