"""Document and article channel resource ACL — aliases over ``context_guard``."""

from __future__ import annotations

from app.services.context_guard import (
    require_channel_in_scope,
    require_channel_write,
    scoped_channel_ids,
)
from app.services.resource_acl_constants import RT_ARTICLE_CHANNEL, RT_DOCUMENT_CHANNEL

__all__ = [
    "require_article_channel_in_scope",
    "require_article_channel_write",
    "require_document_channel_in_scope",
    "require_document_channel_write",
    "scoped_article_channel_ids",
    "scoped_document_channel_ids",
]


async def scoped_document_channel_ids(request, db):
    return await scoped_channel_ids(request, db, RT_DOCUMENT_CHANNEL)


async def scoped_article_channel_ids(request, db):
    return await scoped_channel_ids(request, db, RT_ARTICLE_CHANNEL)


def require_document_channel_in_scope(
    allowed: set[str] | None,
    channel_id: str,
) -> None:
    require_channel_in_scope(allowed, channel_id, detail="Channel not found")


def require_article_channel_in_scope(
    allowed: set[str] | None,
    channel_id: str,
) -> None:
    require_channel_in_scope(allowed, channel_id, detail="Article channel not found")


async def require_document_channel_write(request, db, channel_id: str) -> None:
    await require_channel_write(
        db, request, RT_DOCUMENT_CHANNEL, channel_id, detail="Channel not found"
    )


async def require_article_channel_write(request, db, channel_id: str) -> None:
    await require_channel_write(
        db, request, RT_ARTICLE_CHANNEL, channel_id, detail="Article channel not found"
    )
