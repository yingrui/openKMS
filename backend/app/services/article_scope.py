"""Article visibility — article channel ACL only (no per-article sharing)."""

from __future__ import annotations

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.services.resource_acl_constants import PERM_READ, PERM_WRITE
from app.services.resource_acl_service import (
    article_visible_via_channel,
    channel_allowed_for_article_write,
    scoped_article_predicate,
    scope_applies,
)

__all__ = [
    "article_channel_allowed_for_create",
    "article_list_predicate",
    "article_passes_scoped_predicate",
    "article_visible_via_channel",
    "load_article_scoped",
    "require_article_by_id_read",
    "require_article_read",
    "require_article_write",
    "scoped_article_predicate",
]

article_passes_scoped_predicate = article_visible_via_channel


async def article_channel_allowed_for_create(
    db: AsyncSession, payload: dict, subject: str, channel_id: str
) -> bool:
    if not scope_applies(payload, subject):
        return True
    return await channel_allowed_for_article_write(db, payload, subject, channel_id)


async def require_article_read(db: AsyncSession, request: Request, row: Article) -> Article:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not await article_visible_via_channel(db, p, sub, row):
        raise HTTPException(status_code=404, detail="Article not found")
    return row


async def require_article_write(db: AsyncSession, request: Request, row: Article) -> Article:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not scope_applies(p, sub):
        return row
    if not row.channel_id or not await channel_allowed_for_article_write(
        db, p, sub, row.channel_id
    ):
        raise HTTPException(status_code=404, detail="Article not found")
    return row


async def require_article_by_id_read(
    db: AsyncSession, request: Request, article_id: str
) -> Article:
    row = await db.get(Article, article_id)
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")
    return await require_article_read(db, request, row)


async def load_article_scoped(
    db: AsyncSession, request: Request, article_id: str, required: int = PERM_READ
) -> Article:
    row = await db.get(Article, article_id)
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")
    if required & PERM_WRITE:
        return await require_article_write(db, request, row)
    return await require_article_read(db, request, row)


async def article_list_predicate(db: AsyncSession, request: Request):
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    return await scoped_article_predicate(db, p, sub) if isinstance(sub, str) else None
