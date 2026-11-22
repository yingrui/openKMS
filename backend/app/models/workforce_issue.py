"""One thing that needs a person: a bad answer, a refusal, a call that failed.

Operations is a work queue, not a dashboard: every row is something to look at, decide about, and close. The row is
deliberately source-agnostic — negative feedback, refusals, and (once Guardrails exists) policy and risk findings all
become the same shape, so the queue does not grow a section per producer.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

#: A reader pressed 👎 on an answer.
ISSUE_NEGATIVE_FEEDBACK = "negative_feedback"
#: The answer policy replaced the answer (no citations, unsourced numbers) instead of returning one.
ISSUE_REFUSAL = "refusal"
#: Guardrails found a policy breach. Reserved: nothing writes it until Guardrails ships.
ISSUE_VIOLATION = "violation"
#: Guardrails flagged a risky request or answer. Reserved, same reason.
ISSUE_RISK = "risk"
#: A question looked like an attempt to override the agent's instructions or extract them. A signal for review, not a
#: block: a regex cannot tell a jailbreak from a question *about* jailbreaks.
ISSUE_PROMPT_INJECTION = "prompt_injection"

ISSUE_KINDS = (
    ISSUE_NEGATIVE_FEEDBACK,
    ISSUE_REFUSAL,
    ISSUE_VIOLATION,
    ISSUE_RISK,
    ISSUE_PROMPT_INJECTION,
)

ISSUE_SEVERITY_NORMAL = "normal"
#: Reserved for findings that must not wait: a leaked secret, a policy breach with an external effect.
ISSUE_SEVERITY_HIGH = "high"

ISSUE_OPEN = "open"
ISSUE_RESOLVED = "resolved"
ISSUE_IGNORED = "ignored"

ISSUE_STATUSES = (ISSUE_OPEN, ISSUE_RESOLVED, ISSUE_IGNORED)


class WorkforceIssue(Base):
    """A queue item, closed with a sentence saying what was done about it.

    Three statuses, no more. `resolved` requires a `resolution`: an item marked solved with no explanation is the same
    as no process at all — the next person cannot tell whether it was fixed, worked around, or waved through.
    """

    __tablename__ = "workforce_issues"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    agent_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default=ISSUE_SEVERITY_NORMAL)
    #: What produced it: `feedback:<id>`, `ask:<uuid>`, `guardrail:<id>`. Used to avoid opening the same item twice.
    source_ref: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    #: One readable line for the list — question plus the start of the problem.
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    #: The evidence: question, answer, refusal reason, voter. A service call has no stored message, so the excerpt
    #: lives here; a feedback item points at `message_id` and keeps only the excerpts needed to triage.
    detail: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=ISSUE_OPEN, index=True)
    resolution: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(String(256), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
