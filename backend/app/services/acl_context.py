"""ACL context chains and restriction detection."""

from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.article_channel import ArticleChannel
from app.models.document_channel import DocumentChannel
from app.models.resource_acl import ResourceAclEntry
from app.services.resource_acl_constants import RT_ARTICLE_CHANNEL, RT_DOCUMENT_CHANNEL

async def _acl_entries_for_resources(
    db: AsyncSession, pairs: list[tuple[str, str]]
) -> list[ResourceAclEntry]:
    if not pairs:
        return []
    clauses = [
        (ResourceAclEntry.resource_type == rt) & (ResourceAclEntry.resource_id == rid)
        for rt, rid in pairs
    ]
    result = await db.execute(select(ResourceAclEntry).where(or_(*clauses)))
    return list(result.scalars().all())


async def _document_channel_chain(db: AsyncSession, channel_id: str) -> list[tuple[str, str]]:
    chain: list[tuple[str, str]] = []
    cur_id: str | None = channel_id
    seen: set[str] = set()
    while cur_id and cur_id not in seen:
        seen.add(cur_id)
        chain.append((RT_DOCUMENT_CHANNEL, cur_id))
        ch = await db.get(DocumentChannel, cur_id)
        cur_id = ch.parent_id if ch else None
    return chain


async def _article_channel_chain(db: AsyncSession, channel_id: str) -> list[tuple[str, str]]:
    chain: list[tuple[str, str]] = []
    cur_id: str | None = channel_id
    seen: set[str] = set()
    while cur_id and cur_id not in seen:
        seen.add(cur_id)
        chain.append((RT_ARTICLE_CHANNEL, cur_id))
        ch = await db.get(ArticleChannel, cur_id)
        cur_id = ch.parent_id if ch else None
    return chain


async def resource_context_chain(
    db: AsyncSession, resource_type: str, resource_id: str
) -> list[tuple[str, str]]:
    """Resource itself plus container ancestors for ACL inheritance (nearest first)."""
    chain: list[tuple[str, str]] = [(resource_type, resource_id)]

    if resource_type == RT_DOCUMENT_CHANNEL:
        chain.extend(await _document_channel_chain(db, resource_id))
        chain = list(dict.fromkeys(chain))
    elif resource_type == RT_ARTICLE_CHANNEL:
        chain.extend(await _article_channel_chain(db, resource_id))
        chain = list(dict.fromkeys(chain))

    return list(dict.fromkeys(chain))


async def resource_has_acl_restrictions(
    db: AsyncSession, resource_type: str, resource_id: str
) -> bool:
    chain = await resource_context_chain(db, resource_type, resource_id)
    entries = await _acl_entries_for_resources(db, chain)
    return len(entries) > 0


async def acl_check_required(
    db: AsyncSession, resource_type: str, resource_id: str
) -> bool:
    """True when Layer 2 ACL must be evaluated (has rows or default-closed mode)."""
    if settings.enforce_resource_acl:
        return True
    return await resource_has_acl_restrictions(db, resource_type, resource_id)
