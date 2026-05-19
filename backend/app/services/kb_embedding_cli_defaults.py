"""Resolve embedding base URL, model name, and provider API key for kb-index / openkms-cli."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.api_model import ApiModel
from app.models.knowledge_base import KnowledgeBase


@dataclass(frozen=True)
class KbEmbeddingCliCredentials:
    base_url: str
    model_name: str
    api_key: str


async def get_kb_embedding_credentials_for_cli(
    db: AsyncSession, kb: KnowledgeBase
) -> KbEmbeddingCliCredentials | None:
    """Return credentials for the KB's embedding model, or None if not configured."""
    mid = (kb.embedding_model_id or "").strip()
    if not mid:
        return None

    stmt = (
        select(ApiModel)
        .options(selectinload(ApiModel.provider_rel))
        .where(ApiModel.id == mid)
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if not row or not row.provider_rel:
        return None
    if row.category != "embedding":
        return None

    prov = row.provider_rel
    base = (prov.base_url or "").strip().rstrip("/")
    model = (row.model_name or row.name or "").strip()
    key = (prov.api_key or "").strip()
    return KbEmbeddingCliCredentials(base_url=base, model_name=model, api_key=key)
