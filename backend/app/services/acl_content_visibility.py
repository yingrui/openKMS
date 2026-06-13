"""Per-row content visibility and scoped SQL predicates."""

from __future__ import annotations

from typing import Any

from sqlalchemy import false
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.models.document import Document
from app.models.wiki_models import WikiPage
from app.services.acl_channel_filters import readable_article_channel_ids, readable_document_channel_ids
from app.services.acl_context import acl_check_required
from app.services.acl_resolve import check_resource_access
from app.services.acl_scope import scope_applies
from app.services.resource_acl_constants import (
    PERM_READ,
    PERM_WRITE,
    RT_ARTICLE_CHANNEL,
    RT_DOCUMENT_CHANNEL,
    RT_WIKI_SPACE,
)

async def scoped_document_predicate(db: AsyncSession, payload: dict, subject: str) -> Any | None:
    """Documents visible when their channel (and ancestors) grants read."""
    if not isinstance(subject, str):
        return false()
    allowed_channels = await readable_document_channel_ids(db, payload, subject)
    if not allowed_channels:
        return false()
    return Document.channel_id.in_(allowed_channels)


async def document_visible_via_channel(
    db: AsyncSession, payload: dict, subject: str, doc: Document
) -> bool:
    if not isinstance(subject, str):
        return False
    if not scope_applies(payload, subject):
        return True
    if not doc.channel_id:
        return False
    return await check_resource_access(
        db, payload, subject, RT_DOCUMENT_CHANNEL, doc.channel_id, PERM_READ
    )


# Backward-compatible alias
document_passes_scoped_predicate = document_visible_via_channel


async def scoped_article_predicate(db: AsyncSession, payload: dict, subject: str) -> Any | None:
    """Articles visible when their channel (and ancestors) grants read."""
    if not isinstance(subject, str):
        return false()
    allowed_channels = await readable_article_channel_ids(db, payload, subject)
    if not allowed_channels:
        return false()
    return Article.channel_id.in_(allowed_channels)


async def article_visible_via_channel(
    db: AsyncSession, payload: dict, subject: str, article: Article
) -> bool:
    if not isinstance(subject, str):
        return False
    if not scope_applies(payload, subject):
        return True
    if not article.channel_id:
        return False
    return await check_resource_access(
        db, payload, subject, RT_ARTICLE_CHANNEL, article.channel_id, PERM_READ
    )


# Backward-compatible alias
article_passes_scoped_predicate = article_visible_via_channel


async def wiki_page_visible_via_space(
    db: AsyncSession, payload: dict, subject: str, page: WikiPage
) -> bool:
    if not isinstance(subject, str):
        return False
    if not scope_applies(payload, subject):
        return True
    if not page.wiki_space_id:
        return False
    return await check_resource_access(
        db, payload, subject, RT_WIKI_SPACE, page.wiki_space_id, PERM_READ
    )


async def wiki_page_writable_via_space(
    db: AsyncSession, payload: dict, subject: str, page: WikiPage
) -> bool:
    if not isinstance(subject, str):
        return False
    if not scope_applies(payload, subject):
        return True
    if not page.wiki_space_id:
        return False
    return await check_resource_access(
        db, payload, subject, RT_WIKI_SPACE, page.wiki_space_id, PERM_WRITE
    )


async def instance_visible(
    db: AsyncSession, payload: dict, subject: str, resource_type: str, resource_id: str
) -> bool:
    if not isinstance(subject, str):
        return False
    if not scope_applies(payload, subject):
        return True
    if not await acl_check_required(db, resource_type, resource_id):
        return True
    return await check_resource_access(db, payload, subject, resource_type, resource_id, PERM_READ)


async def channel_allowed_for_document_upload(
    db: AsyncSession, payload: dict, subject: str, channel_id: str
) -> bool:
    if not isinstance(subject, str) or not channel_id:
        return False
    return await check_resource_access(
        db, payload, subject, RT_DOCUMENT_CHANNEL, channel_id, PERM_WRITE
    )


async def channel_allowed_for_article_write(
    db: AsyncSession, payload: dict, subject: str, channel_id: str
) -> bool:
    if not isinstance(subject, str) or not channel_id:
        return False
    return await check_resource_access(
        db, payload, subject, RT_ARTICLE_CHANNEL, channel_id, PERM_WRITE
    )
