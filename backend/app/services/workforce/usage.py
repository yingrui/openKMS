"""How much an agent is being used, and how it is answering.

Read from things the platform already writes rather than from a new call log:

- **calls / errors / last call** come from `audit_events`. Every `POST …/ask` is written by the audit middleware
  (mutations only), and the agent id is in the path, so one indexed query answers "how busy" and "is it erroring".
- **votes** come from `workforce_answer_feedback`.

A second `workforce_agent_calls` table would be the same facts with a chance to disagree; the audit trail is already
the record of what happened. The cost of leaning on it: the numbers are only as complete as auditing is, and they say
nothing about *what* was asked or answered — that needs storing conversation content, which is a separate decision.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_event import AuditEvent
from app.models.workforce_agent import FEEDBACK_DOWN, FEEDBACK_UP, WorkforceAnswerFeedback

#: Busy-ness needs a recent window: an agent that answered daily until March and nothing since would look healthy
#: forever on an all-time total. Votes are all-time on purpose — feedback arrives slowly, and a 7-day window would
#: show 0 for an agent people have used for months.
ACTIVITY_WINDOW_DAYS = 7

_EMPTY_USAGE: dict[str, object] = {
    "calls_7d": 0,
    "errors_7d": 0,
    "last_call_at": None,
    "upvotes": 0,
    "downvotes": 0,
}


def ask_path(agent_id: str) -> str:
    """The one path a caller's question takes. Exact match, so the index on `audit_events.path` is usable."""
    return f"/api/workforce/agents/{agent_id}/ask"


def empty_usage() -> dict[str, object]:
    return dict(_EMPTY_USAGE)


async def usage_by_agent(db: AsyncSession, agent_ids: list[str]) -> dict[str, dict[str, object]]:
    usage = {agent_id: empty_usage() for agent_id in agent_ids}
    if not agent_ids:
        return usage

    paths = {ask_path(agent_id): agent_id for agent_id in agent_ids}
    since = datetime.now(UTC) - timedelta(days=ACTIVITY_WINDOW_DAYS)
    activity = (
        await db.execute(
            select(
                AuditEvent.path,
                func.count(),
                # A caller sees 4xx and 5xx as "it did not work"; counting only 5xx would hide a credential problem.
                func.coalesce(func.sum(case((AuditEvent.status_code >= 400, 1), else_=0)), 0),
                func.max(AuditEvent.at),
            )
            .where(AuditEvent.path.in_(list(paths)), AuditEvent.at >= since)
            .group_by(AuditEvent.path)
        )
    ).all()
    for path, calls, errors, last_at in activity:
        agent_id = paths.get(path)
        if agent_id is None:
            continue
        row = usage[agent_id]
        row["calls_7d"] = int(calls)
        row["errors_7d"] = int(errors)
        row["last_call_at"] = last_at

    votes = (
        await db.execute(
            select(WorkforceAnswerFeedback.agent_id, WorkforceAnswerFeedback.vote, func.count())
            .where(WorkforceAnswerFeedback.agent_id.in_(agent_ids))
            .group_by(WorkforceAnswerFeedback.agent_id, WorkforceAnswerFeedback.vote)
        )
    ).all()
    for agent_id, vote, count in votes:
        row = usage.get(str(agent_id))
        if row is None:
            continue
        if vote == FEEDBACK_UP:
            row["upvotes"] = int(count)
        elif vote == FEEDBACK_DOWN:
            row["downvotes"] = int(count)
    return usage
