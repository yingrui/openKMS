"""Wiki space resource ACL helpers."""

from __future__ import annotations

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wiki_models import WikiSpace
from app.services.resource_acl_constants import PERM_MANAGE, PERM_READ, PERM_WRITE, RT_WIKI_SPACE
from app.services.resource_acl_service import check_resource_access, scope_applies


async def wiki_space_allowed(
    db: AsyncSession,
    request: Request,
    space_id: str,
    required: int,
) -> bool:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not scope_applies(p, sub):
        return True
    return await check_resource_access(db, p, sub, RT_WIKI_SPACE, space_id, required)


async def require_wiki_space_read(
    db: AsyncSession, request: Request, space: WikiSpace
) -> WikiSpace:
    if not await wiki_space_allowed(db, request, space.id, PERM_READ):
        raise HTTPException(status_code=404, detail="Wiki space not found")
    return space


async def require_wiki_space_write(
    db: AsyncSession, request: Request, space: WikiSpace
) -> WikiSpace:
    if not await wiki_space_allowed(db, request, space.id, PERM_WRITE):
        raise HTTPException(status_code=404, detail="Wiki space not found")
    return space


async def require_wiki_space_manage(
    db: AsyncSession, request: Request, space: WikiSpace
) -> WikiSpace:
    if not await wiki_space_allowed(db, request, space.id, PERM_MANAGE):
        raise HTTPException(status_code=404, detail="Wiki space not found")
    return space
