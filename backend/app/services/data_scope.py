"""Group-scoped data visibility (OPENKMS_ENFORCE_GROUP_DATA_SCOPES, local mode)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.access_group import (
    AccessGroupChannel,
    AccessGroupDataset,
    AccessGroupEvaluationDataset,
    AccessGroupKnowledgeBase,
    AccessGroupLinkType,
    AccessGroupObjectType,
    AccessGroupUser,
)
from app.models.document_channel import DocumentChannel


def jwt_is_admin(payload: dict) -> bool:
    realm = payload.get("realm_access") or {}
    roles = realm.get("roles") if isinstance(realm, dict) else []
    if not isinstance(roles, list):
        return False
    return "admin" in {str(r) for r in roles if r is not None}


def scope_applies(payload: dict, user_id: str | None) -> bool:
    """True when list/get/mutate should filter by access groups."""
    if not settings.enforce_group_data_scopes:
        return False
    if settings.auth_mode != "local":
        return False
    if not user_id or user_id == "local-cli":
        return False
    if jwt_is_admin(payload):
        return False
    return True


async def user_group_ids(db: AsyncSession, user_id: str) -> list[str]:
    result = await db.execute(select(AccessGroupUser.group_id).where(AccessGroupUser.user_id == user_id))
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


async def effective_channel_ids(db: AsyncSession, user_id: str) -> set[str] | None:
    """None = unrestricted. Empty set = no channels. Non-empty = allowed IDs including descendants."""
    gids = await user_group_ids(db, user_id)
    if not gids:
        return None
    result = await db.execute(
        select(AccessGroupChannel.channel_id).where(AccessGroupChannel.group_id.in_(gids))
    )
    roots = {str(row[0]) for row in result.all()}
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


async def _union_resource_ids(
    db: AsyncSession, group_ids: list[str], model, fk_column: str
) -> set[str] | None:
    if not group_ids:
        return None
    col = getattr(model, fk_column)
    result = await db.execute(select(col).where(model.group_id.in_(group_ids)))
    ids = {str(row[0]) for row in result.all()}
    if not ids:
        return set()
    return ids


async def effective_knowledge_base_ids(db: AsyncSession, user_id: str) -> set[str] | None:
    gids = await user_group_ids(db, user_id)
    return await _union_resource_ids(db, gids, AccessGroupKnowledgeBase, "knowledge_base_id")


async def effective_evaluation_dataset_ids(db: AsyncSession, user_id: str) -> set[str] | None:
    gids = await user_group_ids(db, user_id)
    return await _union_resource_ids(db, gids, AccessGroupEvaluationDataset, "evaluation_dataset_id")


async def effective_dataset_ids(db: AsyncSession, user_id: str) -> set[str] | None:
    gids = await user_group_ids(db, user_id)
    return await _union_resource_ids(db, gids, AccessGroupDataset, "dataset_id")


async def effective_object_type_ids(db: AsyncSession, user_id: str) -> set[str] | None:
    gids = await user_group_ids(db, user_id)
    return await _union_resource_ids(db, gids, AccessGroupObjectType, "object_type_id")


async def effective_link_type_ids(db: AsyncSession, user_id: str) -> set[str] | None:
    gids = await user_group_ids(db, user_id)
    return await _union_resource_ids(db, gids, AccessGroupLinkType, "link_type_id")
