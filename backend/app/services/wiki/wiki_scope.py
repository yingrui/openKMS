"""Wiki space resource ACL — thin aliases over ``resource_guard``."""

from __future__ import annotations

from app.models.wiki_models import WikiSpace
from app.services.acl.resource_acl_constants import PERM_MANAGE, PERM_READ, PERM_WRITE, RT_WIKI_SPACE
from app.services.acl.resource_guard import (
    load_scoped_resource,
    require_manage,
    require_read,
    require_write,
    resource_allowed,
)

__all__ = [
    "load_wiki_space_scoped",
    "require_wiki_space_manage",
    "require_wiki_space_read",
    "require_wiki_space_write",
    "wiki_space_allowed",
]


async def wiki_space_allowed(db, request, space_id: str, required: int) -> bool:
    return await resource_allowed(db, request, RT_WIKI_SPACE, space_id, required)


async def require_wiki_space_read(db, request, space: WikiSpace) -> WikiSpace:
    return await require_read(db, request, RT_WIKI_SPACE, space)


async def require_wiki_space_write(db, request, space: WikiSpace) -> WikiSpace:
    return await require_write(db, request, RT_WIKI_SPACE, space)


async def require_wiki_space_manage(db, request, space: WikiSpace) -> WikiSpace:
    return await require_manage(db, request, RT_WIKI_SPACE, space)


async def load_wiki_space_scoped(
    db, request, space_id: str, required: int = PERM_READ
) -> WikiSpace:
    return await load_scoped_resource(db, request, RT_WIKI_SPACE, space_id, required)
