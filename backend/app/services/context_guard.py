"""Layer 2 guard for hierarchical resources (document/article channels).

Documents, articles, and wiki pages use container-only ACL via scope modules.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article_channel import ArticleChannel
from app.models.document_channel import DocumentChannel
from app.models.media_channel import MediaChannel
from app.services.resource_acl_constants import (
    PERM_WRITE,
    RT_ARTICLE_CHANNEL,
    RT_DOCUMENT_CHANNEL,
    RT_MEDIA_CHANNEL,
)
from app.services.resource_guard import resource_allowed
from app.services.resource_acl_service import (
    readable_article_channel_ids,
    readable_document_channel_ids,
    readable_media_channel_ids,
)


@dataclass(frozen=True)
class ContextChannelSpec:
    model: type
    resource_type: str
    not_found_detail: str
    readable_ids: Callable[[AsyncSession, dict, str], Awaitable[set[str] | None]]


CONTEXT_CHANNEL_REGISTRY: dict[str, ContextChannelSpec] = {
    RT_DOCUMENT_CHANNEL: ContextChannelSpec(
        DocumentChannel,
        RT_DOCUMENT_CHANNEL,
        "Channel not found",
        readable_ids=readable_document_channel_ids,
    ),
    RT_ARTICLE_CHANNEL: ContextChannelSpec(
        ArticleChannel,
        RT_ARTICLE_CHANNEL,
        "Article channel not found",
        readable_ids=readable_article_channel_ids,
    ),
    RT_MEDIA_CHANNEL: ContextChannelSpec(
        MediaChannel,
        RT_MEDIA_CHANNEL,
        "Media channel not found",
        readable_ids=readable_media_channel_ids,
    ),
}


def not_found_detail(resource_type: str) -> str:
    channel = CONTEXT_CHANNEL_REGISTRY.get(resource_type)
    if channel:
        return channel.not_found_detail
    return "Resource not found"


async def context_resource_allowed(
    db: AsyncSession,
    request: Request,
    resource_type: str,
    resource_id: str,
    required: int,
) -> bool:
    return await resource_allowed(db, request, resource_type, resource_id, required)


async def scoped_channel_ids(
    request: Request,
    db: AsyncSession,
    resource_type: str,
) -> set[str] | None:
    spec = CONTEXT_CHANNEL_REGISTRY.get(resource_type)
    if spec is None:
        raise ValueError(f"Unsupported channel type: {resource_type}")
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str):
        return None
    return await spec.readable_ids(db, p, sub)


def require_channel_in_scope(
    allowed: set[str] | None,
    channel_id: str,
    *,
    detail: str = "Channel not found",
) -> None:
    if allowed is None:
        return
    if channel_id not in allowed:
        raise HTTPException(status_code=404, detail=detail)


async def require_channel_write(
    db: AsyncSession,
    request: Request,
    resource_type: str,
    channel_id: str,
    *,
    detail: str = "Channel not found",
) -> None:
    """Require channel write (404 when denied, same as read scope)."""
    if not await context_resource_allowed(db, request, resource_type, channel_id, PERM_WRITE):
        raise HTTPException(status_code=404, detail=detail)
