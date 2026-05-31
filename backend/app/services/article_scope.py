"""Group-scoped visibility for articles (delegates to resource ACL)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.services.resource_acl_constants import PERM_WRITE, RT_ARTICLE_CHANNEL
from app.services.resource_acl_service import (
    article_passes_scoped_predicate,
    check_resource_access,
    scoped_article_predicate,
    scope_applies,
)

__all__ = [
    "article_channel_allowed_for_create",
    "article_passes_scoped_predicate",
    "scoped_article_predicate",
]


async def article_channel_allowed_for_create(
    db: AsyncSession, payload: dict, subject: str, channel_id: str
) -> bool:
    if not scope_applies(payload, subject):
        return True
    return await check_resource_access(db, payload, subject, RT_ARTICLE_CHANNEL, channel_id, PERM_WRITE)
