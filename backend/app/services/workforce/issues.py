"""Recording and closing queue items.

Producers write; the queue reads. Keeping both in one module means the rules that matter — one open item per source, a
resolution required to close — live in one place instead of being re-derived by each caller.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workforce_issue import (
    ISSUE_OPEN,
    ISSUE_RESOLVED,
    ISSUE_SEVERITY_NORMAL,
    WorkforceIssue,
)

#: A summary is one line in a list; longer than this and the list stops being scannable (the evidence is in `detail`).
SUMMARY_CHARS = 200
#: How much of a question or answer is kept for triage. Enough to recognise the case, not a second copy of the corpus —
#: and short enough that one item stays a glanceable card rather than a page of answer.
EXCERPT_CHARS = 300


def excerpt(text: str | None, limit: int = EXCERPT_CHARS) -> str:
    value = (text or "").strip()
    if len(value) <= limit:
        return value
    return value[:limit].rstrip() + "…"


async def open_issue(
    db: AsyncSession,
    *,
    agent_id: str,
    kind: str,
    source_ref: str,
    summary: str,
    detail: dict[str, Any] | None = None,
    severity: str = ISSUE_SEVERITY_NORMAL,
) -> WorkforceIssue | None:
    """Open an item, unless one is already open for the same source.

    Returns None when the item was already queued: a second 👎 on the same answer, or a caller retrying a refused
    question, should not fill the queue with duplicates of one case.
    """
    existing = (
        await db.execute(
            select(WorkforceIssue.id).where(
                WorkforceIssue.source_ref == source_ref,
                WorkforceIssue.kind == kind,
                WorkforceIssue.status == ISSUE_OPEN,
            )
        )
    ).scalars().first()
    if existing is not None:
        return None
    row = WorkforceIssue(
        id=str(uuid.uuid4()),
        agent_id=agent_id,
        kind=kind,
        severity=severity,
        source_ref=source_ref,
        summary=excerpt(summary, SUMMARY_CHARS),
        detail=detail,
        status=ISSUE_OPEN,
    )
    db.add(row)
    return row


async def close_for_source(
    db: AsyncSession, *, source_ref: str, kind: str, resolution: str
) -> bool:
    """Close a still-open item whose reason no longer holds (a 👎 withdrawn within the conversation).

    Not a decision by an operator — the recorded resolution says so, because "ignored" left unexplained would read as a
    judgement someone made.
    """
    row = (
        await db.execute(
            select(WorkforceIssue).where(
                WorkforceIssue.source_ref == source_ref,
                WorkforceIssue.kind == kind,
                WorkforceIssue.status == ISSUE_OPEN,
            )
        )
    ).scalars().first()
    if row is None:
        return False
    row.status = "ignored"
    row.resolution = resolution
    row.resolved_at = datetime.now(UTC)
    return True


def apply_status(
    row: WorkforceIssue, *, status: str, resolution: str | None, resolved_by: str | None
) -> bool:
    """Move an item to `status`. Returns False when a resolution was required and missing."""
    text = (resolution or "").strip()
    if status == ISSUE_RESOLVED and not text:
        return False
    row.status = status
    row.resolution = text or None
    row.resolved_at = datetime.now(UTC)
    row.resolved_by = resolved_by
    return True
