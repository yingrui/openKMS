"""Versioned prompt text for a knowledge base's QA agent.

The design note (`docs/features/knowledge-base-qa-agent.md`, proposal 3) makes four demands of any prompt store, and this
model exists to satisfy them rather than to store a string:

- **Default in code** — `app/services/workspace/evaluations/prompt_store.py` carries the built-in text; a row here is an
  override, never the only copy.
- **Versioned, not editable** — a new row per version. Editing in place would erase what produced last week's answers.
- **Publish gated** — publishing requires a completed evaluation run created *after* the draft, and records which one. The
  gate is evidence, not a threshold nobody can justify.
- **Attributable and reversible** — one `published` row per key, and publishing an older version is the rollback.

`MEMORY.md` has no counterpart here: memory is per conversation and per user, and a shared one would leak between them.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

#: The one key in use. A key per surface would multiply the gate; the agent has one base instruction.
PROMPT_KEY_SYSTEM = "system"

STATUS_DRAFT = "draft"
STATUS_PUBLISHED = "published"
STATUS_RETIRED = "retired"


class AgentPrompt(Base):
    """One version of a knowledge base's agent prompt."""

    __tablename__ = "agent_prompts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    knowledge_base_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(64), nullable=False, default=PROMPT_KEY_SYSTEM)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    #: Free text from whoever wrote it: what changed and why. Shown in the version list.
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=STATUS_DRAFT)
    #: The evaluation run that justified publishing. Null on a draft.
    gated_by_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
