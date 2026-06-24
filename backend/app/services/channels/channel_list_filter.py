"""Shared channel subtree filter for document/article list endpoints."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.acl.resource_acl_constants import PERM_READ
from app.services.acl.resource_acl_service import check_resource_access, scope_applies

__all__ = ["channel_subtree_ids_for_list"]


async def channel_subtree_ids_for_list(
    db: AsyncSession,
    request: Request,
    *,
    channel_id: str,
    channel_model: type,
    rt_channel: str,
    collect_descendants: Callable[[list[Any], str, set[str]], None],
    not_found_detail: str = "Channel not found",
) -> set[str]:
    """Return channel id + descendants after read ACL on the requested channel."""
    result = await db.execute(select(channel_model).order_by(channel_model.sort_order))
    all_channels = list(result.scalars().all())
    target = next((c for c in all_channels if c.id == channel_id), None)
    if not target:
        raise HTTPException(status_code=404, detail=not_found_detail)
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if isinstance(sub, str) and not await check_resource_access(
        db, p, sub, rt_channel, channel_id, PERM_READ
    ):
        raise HTTPException(status_code=404, detail=not_found_detail)
    ids_to_include: set[str] = set()
    collect_descendants(all_channels, channel_id, ids_to_include)
    return ids_to_include
