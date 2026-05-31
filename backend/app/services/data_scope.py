"""Group-scoped data visibility helpers and channel tree expansion."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.access_group import AccessGroupMember
from app.models.article_channel import ArticleChannel
from app.models.document_channel import DocumentChannel


def jwt_is_admin(payload: dict) -> bool:
    from app.services.resource_acl_service import jwt_is_admin as _impl

    return _impl(payload)


async def user_group_ids_legacy(db: AsyncSession, user_id: str) -> list[str]:
    """Deprecated alias."""
    result = await db.execute(
        select(AccessGroupMember.group_id).where(AccessGroupMember.subject == user_id)
    )
    return [str(row[0]) for row in result.all()]


def _expand_channel_ids(all_channels: list[DocumentChannel], roots: set[str]) -> set[str]:
    by_parent: dict[str | None, list[DocumentChannel]] = {}
    for c in all_channels:
        by_parent.setdefault(c.parent_id, []).append(c)

    out: set[str] = set()

    def walk(cid: str) -> None:
        if cid in out:
            return
        out.add(cid)
        for ch in by_parent.get(cid, []):
            walk(ch.id)

    all_ids = {c.id for c in all_channels}
    for r in roots:
        if r in all_ids:
            walk(r)
    return out


async def expanded_channel_ids_for_roots(db: AsyncSession, roots: set[str]) -> set[str]:
    """All channel IDs at or under roots, plus ancestor chain up to root (for tree UX)."""
    if not roots:
        return set()
    ch_result = await db.execute(select(DocumentChannel))
    all_ch = list(ch_result.scalars().all())
    down = _expand_channel_ids(all_ch, roots)
    by_id = {c.id: c for c in all_ch}
    full = set(down)
    for cid in list(down):
        cur = by_id.get(cid)
        while cur and cur.parent_id:
            pid = cur.parent_id
            if pid in full:
                break
            full.add(pid)
            cur = by_id.get(pid)
    return full


def _expand_article_channel_ids(all_channels: list[ArticleChannel], roots: set[str]) -> set[str]:
    by_parent: dict[str | None, list[ArticleChannel]] = {}
    for c in all_channels:
        by_parent.setdefault(c.parent_id, []).append(c)

    out: set[str] = set()

    def walk(cid: str) -> None:
        if cid in out:
            return
        out.add(cid)
        for ch in by_parent.get(cid, []):
            walk(ch.id)

    all_ids = {c.id for c in all_channels}
    for r in roots:
        if r in all_ids:
            walk(r)
    return out


async def expanded_article_channel_ids_for_roots(db: AsyncSession, roots: set[str]) -> set[str]:
    """Article channel IDs at or under roots, plus ancestors up to tree root (for tree UX)."""
    if not roots:
        return set()
    ch_result = await db.execute(select(ArticleChannel))
    all_ch = list(ch_result.scalars().all())
    down = _expand_article_channel_ids(all_ch, roots)
    by_id = {c.id: c for c in all_ch}
    full = set(down)
    for cid in list(down):
        cur = by_id.get(cid)
        while cur and cur.parent_id:
            pid = cur.parent_id
            if pid in full:
                break
            full.add(pid)
            cur = by_id.get(pid)
    return full


# Re-export ACL API (replaces legacy group-scope functions)
from app.services.resource_acl_service import (  # noqa: E402
    acl_applies,
    article_passes_scoped_predicate,
    bootstrap_owner_acl,
    channel_allowed_for_document_upload,
    check_resource_access,
    document_passes_scoped_predicate,
    effective_article_channel_ids,
    effective_channel_ids,
    effective_channel_ids_with_data_resources,
    effective_dataset_ids,
    effective_evaluation_ids,
    effective_knowledge_base_ids,
    effective_link_type_ids,
    effective_object_type_ids,
    effective_permissions,
    effective_wiki_space_ids,
    instance_visible,
    jwt_is_admin,
    list_acl_entries,
    replace_resource_acl,
    scoped_article_predicate,
    scoped_document_predicate,
    scope_applies,
    user_group_ids,
)

__all__ = [
    "acl_applies",
    "article_passes_scoped_predicate",
    "bootstrap_owner_acl",
    "channel_allowed_for_document_upload",
    "check_resource_access",
    "document_passes_scoped_predicate",
    "effective_article_channel_ids",
    "effective_channel_ids",
    "effective_channel_ids_with_data_resources",
    "effective_dataset_ids",
    "effective_evaluation_ids",
    "effective_knowledge_base_ids",
    "effective_link_type_ids",
    "effective_object_type_ids",
    "effective_permissions",
    "effective_wiki_space_ids",
    "expanded_article_channel_ids_for_roots",
    "expanded_channel_ids_for_roots",
    "instance_visible",
    "jwt_is_admin",
    "list_acl_entries",
    "replace_resource_acl",
    "scoped_article_predicate",
    "scoped_document_predicate",
    "scope_applies",
    "user_group_ids",
]
