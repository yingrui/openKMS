"""Media asset visibility — media channel ACL only."""

from __future__ import annotations

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.media_asset import MediaAsset
from app.services.acl.resource_acl_constants import PERM_READ, PERM_WRITE
from app.services.acl.resource_acl_service import (
    channel_allowed_for_media_write,
    scoped_media_predicate,
    media_visible_via_channel,
)
from app.services.acl.data_scope import scope_applies

__all__ = [
    "load_media_scoped",
    "media_list_predicate",
    "require_media_read",
    "require_media_write",
    "scoped_media_predicate",
]


async def require_media_read(db: AsyncSession, request: Request, row: MediaAsset) -> MediaAsset:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not await media_visible_via_channel(db, p, sub, row):
        raise HTTPException(status_code=404, detail="Media asset not found")
    return row


async def require_media_write(db: AsyncSession, request: Request, row: MediaAsset) -> MediaAsset:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not scope_applies(p, sub):
        return row
    if not row.channel_id or not await channel_allowed_for_media_write(db, p, sub, row.channel_id):
        raise HTTPException(status_code=404, detail="Media asset not found")
    return row


async def load_media_scoped(
    db: AsyncSession, request: Request, asset_id: str, required: int = PERM_READ
) -> MediaAsset:
    row = await db.get(MediaAsset, asset_id)
    if not row:
        raise HTTPException(status_code=404, detail="Media asset not found")
    if required & PERM_WRITE:
        return await require_media_write(db, request, row)
    return await require_media_read(db, request, row)


async def media_list_predicate(db: AsyncSession, request: Request):
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    return await scoped_media_predicate(db, p, sub) if isinstance(sub, str) else None
