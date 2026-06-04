"""Object/link type resource ACL — thin aliases over ``resource_guard``."""

from __future__ import annotations

from app.models.link_type import LinkType
from app.models.object_type import ObjectType
from app.services.resource_acl_constants import RT_LINK_TYPE, RT_OBJECT_TYPE
from app.services.resource_guard import require_resource_by_id

__all__ = [
    "link_type_allowed",
    "object_type_allowed",
    "require_link_type_permission",
    "require_object_type_permission",
]


async def object_type_allowed(db, request, object_type_id: str, required: int) -> bool:
    from app.services.resource_guard import resource_allowed

    return await resource_allowed(db, request, RT_OBJECT_TYPE, object_type_id, required)


async def link_type_allowed(db, request, link_type_id: str, required: int) -> bool:
    from app.services.resource_guard import resource_allowed

    return await resource_allowed(db, request, RT_LINK_TYPE, link_type_id, required)


async def require_object_type_permission(
    request, db, object_type_id: str, required: int
) -> ObjectType:
    return await require_resource_by_id(db, request, RT_OBJECT_TYPE, object_type_id, required)


async def require_link_type_permission(
    request, db, link_type_id: str, required: int
) -> LinkType:
    return await require_resource_by_id(db, request, RT_LINK_TYPE, link_type_id, required)
