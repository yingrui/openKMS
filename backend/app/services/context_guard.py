"""Layer 2 guard for hierarchical resources (document/article channels, wiki pages).

Documents and articles use channel-only ACL via ``document_scope`` / ``article_scope``.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article_channel import ArticleChannel
from app.models.document_channel import DocumentChannel
from app.models.wiki_models import WikiPage
from app.services.resource_acl_constants import (
    PERM_READ,
    PERM_WRITE,
    RT_ARTICLE_CHANNEL,
    RT_DOCUMENT_CHANNEL,
    RT_WIKI_PAGE,
)
from app.services.resource_acl_service import (
    check_resource_access,
    readable_article_channel_ids,
    readable_document_channel_ids,
    scope_applies,
)


@dataclass(frozen=True)
class ContextLeafSpec:
    model: type
    resource_type: str
    not_found_detail: str


@dataclass(frozen=True)
class ContextChannelSpec:
    model: type
    resource_type: str
    not_found_detail: str
    readable_ids: Callable[[AsyncSession, dict, str], Awaitable[set[str] | None]]


CONTEXT_LEAF_REGISTRY: dict[str, ContextLeafSpec] = {
    RT_WIKI_PAGE: ContextLeafSpec(
        WikiPage,
        RT_WIKI_PAGE,
        "Wiki page not found",
    ),
}

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
}


def not_found_detail(resource_type: str) -> str:
    leaf = CONTEXT_LEAF_REGISTRY.get(resource_type)
    if leaf:
        return leaf.not_found_detail
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
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not scope_applies(p, sub):
        return True
    return await check_resource_access(db, p, sub, resource_type, resource_id, required)


async def load_context_resource(
    db: AsyncSession,
    request: Request,
    resource_type: str,
    resource_id: str,
    required: int = PERM_READ,
) -> Any:
    """Load a wiki page and enforce Layer 2 ACL."""
    leaf = CONTEXT_LEAF_REGISTRY.get(resource_type)
    if leaf is None:
        raise ValueError(f"Unsupported context leaf type: {resource_type}")
    row = await db.get(leaf.model, resource_id)
    if not row:
        raise HTTPException(status_code=404, detail=leaf.not_found_detail)
    if not await context_resource_allowed(db, request, resource_type, resource_id, required):
        raise HTTPException(status_code=404, detail=leaf.not_found_detail)
    return row


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
