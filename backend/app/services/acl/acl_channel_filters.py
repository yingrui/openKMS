"""Batch-readable document and article channel id filters."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.article_channel import ArticleChannel
from app.models.document_channel import DocumentChannel
from app.models.media_channel import MediaChannel
from app.models.resource_acl import ResourceAclEntry
from app.services.acl.acl_resolve import check_resource_access
from app.services.acl.resource_acl_constants import (
    PERM_READ,
    RT_ARTICLE_CHANNEL,
    RT_DOCUMENT_CHANNEL,
    RT_MEDIA_CHANNEL,
)

def _expand_channel_ids(all_channels: list, roots: set[str], id_attr: str = "id", parent_attr: str = "parent_id") -> set[str]:
    by_parent: dict[str | None, list] = {}
    for c in all_channels:
        by_parent.setdefault(getattr(c, parent_attr), []).append(c)

    out: set[str] = set()

    def walk(cid: str) -> None:
        if cid in out:
            return
        out.add(cid)
        for ch in by_parent.get(cid, []):
            walk(getattr(ch, id_attr))

    all_ids = {getattr(c, id_attr) for c in all_channels}
    for r in roots:
        if r in all_ids:
            walk(r)
    return out


def _channel_ids_requiring_acl_check(
    channels: list[Any],
    ids_with_direct_acl: set[str],
) -> set[str]:
    """Channel ids whose self-or-ancestor chain has ACL rows (or all ids when enforce)."""
    if not channels:
        return set()
    if settings.enforce_resource_acl:
        return {str(getattr(c, "id")) for c in channels}
    if not ids_with_direct_acl:
        return set()

    by_id = {str(getattr(c, "id")): c for c in channels}
    memo: dict[str, bool] = {}

    def restricted(cid: str) -> bool:
        if cid in memo:
            return memo[cid]
        if cid in ids_with_direct_acl:
            memo[cid] = True
            return True
        ch = by_id.get(cid)
        pid = getattr(ch, "parent_id", None) if ch else None
        if pid and str(pid) in by_id:
            result = restricted(str(pid))
        else:
            result = False
        memo[cid] = result
        return result

    return {str(getattr(c, "id")) for c in channels if restricted(str(getattr(c, "id")))}


async def _readable_channel_ids_batched(
    db: AsyncSession,
    payload: dict,
    subject: str,
    resource_type: str,
    channel_model: type,
) -> set[str]:
    if not isinstance(subject, str):
        return set()
    result = await db.execute(select(channel_model))
    channels = list(result.scalars().all())
    all_ids = {str(getattr(c, "id")) for c in channels}
    if not all_ids:
        return set()

    entries_result = await db.execute(
        select(ResourceAclEntry.resource_id)
        .where(ResourceAclEntry.resource_type == resource_type)
        .distinct()
    )
    ids_with_acl = {str(row[0]) for row in entries_result.all()}
    restricted = _channel_ids_requiring_acl_check(channels, ids_with_acl)

    readable: set[str] = set()
    for cid in all_ids:
        if cid not in restricted:
            readable.add(cid)
        elif await check_resource_access(db, payload, subject, resource_type, cid, PERM_READ):
            readable.add(cid)
    return readable


async def readable_document_channel_ids(
    db: AsyncSession, payload: dict, subject: str
) -> set[str] | None:
    """Channel ids the user may list/read.

    Channels without ACL on themselves or any ancestor are open to all authenticated users.
    Restricted channels require a matching grant (group, user, or authenticated/Others).
    """
    return await _readable_channel_ids_batched(
        db, payload, subject, RT_DOCUMENT_CHANNEL, DocumentChannel
    )


async def readable_article_channel_ids(
    db: AsyncSession, payload: dict, subject: str
) -> set[str] | None:
    return await _readable_channel_ids_batched(
        db, payload, subject, RT_ARTICLE_CHANNEL, ArticleChannel
    )


# Legacy name used by list filters
async def accessible_document_channel_ids(
    db: AsyncSession, subject: str, payload: dict | None = None
) -> set[str] | None:
    if payload is None:
        return None
    return await readable_document_channel_ids(db, payload, subject)


async def accessible_article_channel_ids(
    db: AsyncSession, subject: str, payload: dict | None = None
) -> set[str] | None:
    if payload is None:
        return None
    return await readable_article_channel_ids(db, payload, subject)


async def readable_media_channel_ids(
    db: AsyncSession, payload: dict, subject: str
) -> set[str] | None:
    return await _readable_channel_ids_batched(
        db, payload, subject, RT_MEDIA_CHANNEL, MediaChannel
    )


async def accessible_media_channel_ids(
    db: AsyncSession, subject: str, payload: dict | None = None
) -> set[str] | None:
    if payload is None:
        return None
    return await readable_media_channel_ids(db, payload, subject)
