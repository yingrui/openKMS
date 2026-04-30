"""Group-scoped visibility for articles (by article channel tree)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import false, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.services.data_scope import effective_article_channel_ids, scope_applies


async def scoped_article_predicate(db: AsyncSession, jwt_payload: dict, sub: str) -> Any | None:
    """None = no extra filter. Otherwise restrict to allowed article channel IDs."""
    if not scope_applies(jwt_payload, sub):
        return None
    allowed = await effective_article_channel_ids(db, sub)
    if allowed is None:
        return None
    if not allowed:
        return false()
    return Article.channel_id.in_(allowed)


async def article_passes_scoped_predicate(db: AsyncSession, jwt_payload: dict, sub: str, row: Article) -> bool:
    pred = await scoped_article_predicate(db, jwt_payload, sub)
    if pred is None:
        return True
    r = await db.execute(select(Article.id).where(Article.id == row.id).where(pred))
    return r.scalar_one_or_none() is not None


async def article_channel_allowed_for_create(db: AsyncSession, user_id: str, channel_id: str) -> bool:
    """Create article in channel: allowed if channel in expanded effective set."""
    allowed = await effective_article_channel_ids(db, user_id)
    if allowed is None:
        return True
    return channel_id in allowed
