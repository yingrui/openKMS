"""Object type and link type resource ACL helpers."""

from __future__ import annotations

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.link_type import LinkType
from app.models.object_type import ObjectType
from app.services.resource_acl_constants import PERM_MANAGE, PERM_READ, PERM_WRITE, RT_LINK_TYPE, RT_OBJECT_TYPE
from app.services.resource_acl_service import check_resource_access, scope_applies


async def object_type_allowed(
    db: AsyncSession,
    request: Request,
    object_type_id: str,
    required: int,
) -> bool:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not scope_applies(p, sub):
        return True
    return await check_resource_access(db, p, sub, RT_OBJECT_TYPE, object_type_id, required)


async def link_type_allowed(
    db: AsyncSession,
    request: Request,
    link_type_id: str,
    required: int,
) -> bool:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not scope_applies(p, sub):
        return True
    return await check_resource_access(db, p, sub, RT_LINK_TYPE, link_type_id, required)


async def require_object_type_permission(
    request: Request,
    db: AsyncSession,
    object_type_id: str,
    required: int,
) -> ObjectType:
    ot = await db.get(ObjectType, object_type_id)
    if not ot:
        raise HTTPException(status_code=404, detail="Object type not found")
    if not await object_type_allowed(db, request, object_type_id, required):
        raise HTTPException(status_code=404, detail="Object type not found")
    return ot


async def require_link_type_permission(
    request: Request,
    db: AsyncSession,
    link_type_id: str,
    required: int,
) -> LinkType:
    lt = await db.get(LinkType, link_type_id)
    if not lt:
        raise HTTPException(status_code=404, detail="Link type not found")
    if not await link_type_allowed(db, request, link_type_id, required):
        raise HTTPException(status_code=404, detail="Link type not found")
    return lt
