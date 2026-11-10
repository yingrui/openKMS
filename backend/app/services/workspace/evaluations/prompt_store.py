"""The KB agent's prompt: versioned text, published against evidence.

Four rules, from `docs/features/knowledge-base-qa-agent.md`:

1. **The default lives in code.** `DEFAULT_SYSTEM_PROMPT` below; a published row overrides it, never replaces the only copy.
   A database with no rows means the agent behaves exactly as it did before this file existed.
2. **A version is a row.** Nothing is edited in place, so a published version can be re-published (rollback) and the text
   that produced last week's answers still exists.
3. **Publishing is gated by a run.** Not by a threshold nobody can defend: the version records which completed evaluation run
   was created *after* the draft. No run, no publication.
4. **One live version per key**, enforced by a partial unique index rather than by hope.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_prompt import (
    PROMPT_KEY_SYSTEM,
    STATUS_DRAFT,
    STATUS_PUBLISHED,
    STATUS_RETIRED,
    AgentPrompt,
)
from app.models.evaluation import Evaluation
from app.models.evaluation_run import EvaluationRun

#: What the agent says when a KB has published nothing. This is the base instruction assembled in `qa_agent/agent.py`; the
#: store's job is to let a KB override it, not to become the only source.
DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful assistant answering questions based on **this** knowledge base "
    "(and only the skills enabled for it). Do not invent a different product domain "
    "unless the retrieved context or enabled skills are about that domain."
)


class PromptStoreError(ValueError):
    """A refusal the caller can act on: no evidence, nothing to publish, unknown version."""


async def published_prompt(db: AsyncSession, kb_id: str, key: str = PROMPT_KEY_SYSTEM) -> AgentPrompt | None:
    """The live version for a KB, if any."""
    result = await db.execute(
        select(AgentPrompt).where(
            AgentPrompt.knowledge_base_id == kb_id,
            AgentPrompt.key == key,
            AgentPrompt.status == STATUS_PUBLISHED,
        )
    )
    return result.scalar_one_or_none()


async def resolve_system_prompt(db: AsyncSession, kb_id: str) -> tuple[str, str | None]:
    """`(text, version_label)` — the published override when there is one, otherwise the code default."""
    row = await published_prompt(db, kb_id)
    if row is None:
        return DEFAULT_SYSTEM_PROMPT, None
    return row.body, f"{row.key}@v{row.version}"


async def list_versions(db: AsyncSession, kb_id: str, key: str = PROMPT_KEY_SYSTEM) -> list[AgentPrompt]:
    result = await db.execute(
        select(AgentPrompt)
        .where(AgentPrompt.knowledge_base_id == kb_id, AgentPrompt.key == key)
        .order_by(AgentPrompt.version.desc())
    )
    return list(result.scalars().all())


async def create_draft(
    db: AsyncSession,
    kb_id: str,
    *,
    body: str,
    notes: str | None,
    author: str | None,
    author_name: str | None,
    key: str = PROMPT_KEY_SYSTEM,
) -> AgentPrompt:
    """A new version, as a draft. Nothing the agent reads changes until it is published."""
    text = (body or "").strip()
    if not text:
        raise PromptStoreError("A prompt version cannot be empty.")
    versions = await list_versions(db, kb_id, key)
    draft = AgentPrompt(
        id=str(uuid.uuid4()),
        knowledge_base_id=kb_id,
        key=key,
        version=(versions[0].version + 1) if versions else 1,
        body=text,
        notes=(notes or "").strip() or None,
        status=STATUS_DRAFT,
        created_by=author,
        created_by_name=author_name,
    )
    db.add(draft)
    await db.flush()
    return draft


async def latest_run_since(db: AsyncSession, kb_id: str, since: datetime) -> EvaluationRun | None:
    """A completed evaluation run for this KB's evaluations, created after `since`."""
    result = await db.execute(
        select(EvaluationRun)
        .join(Evaluation, Evaluation.id == EvaluationRun.evaluation_id)
        .where(
            Evaluation.knowledge_base_id == kb_id,
            EvaluationRun.created_at >= since,
            EvaluationRun.status == "completed",
            EvaluationRun.item_count > 0,
        )
        .order_by(EvaluationRun.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def publish(db: AsyncSession, kb_id: str, version: int, key: str = PROMPT_KEY_SYSTEM) -> AgentPrompt:
    """Make one version live, retiring whatever was live, with the run that justifies it recorded."""
    result = await db.execute(
        select(AgentPrompt).where(
            AgentPrompt.knowledge_base_id == kb_id,
            AgentPrompt.key == key,
            AgentPrompt.version == version,
        )
    )
    target = result.scalar_one_or_none()
    if target is None:
        raise PromptStoreError(f"Version {version} does not exist.")

    gate = await latest_run_since(db, kb_id, target.created_at)
    if gate is None:
        raise PromptStoreError(
            "Publishing needs an evaluation run made after this draft. Run one, then publish."
        )

    current = await published_prompt(db, kb_id, key)
    if current is not None and current.id != target.id:
        current.status = STATUS_RETIRED
        # Flush the retirement **before** publishing: the partial unique index allows one live version per key, and two
        # updates in one flush go out in whatever order SQLAlchemy chooses — which for a rollback is the order that collides.
        await db.flush()

    target.status = STATUS_PUBLISHED
    target.gated_by_run_id = gate.id
    target.published_at = datetime.now(timezone.utc)
    await db.flush()
    return target


def to_response(row: AgentPrompt) -> dict[str, Any]:
    return {
        "id": row.id,
        "key": row.key,
        "version": row.version,
        "body": row.body,
        "notes": row.notes,
        "status": row.status,
        "gated_by_run_id": row.gated_by_run_id,
        "created_by_name": row.created_by_name,
        "created_at": row.created_at,
        "published_at": row.published_at,
    }
