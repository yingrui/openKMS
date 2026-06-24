"""Knowledge base resource ACL — thin aliases over ``resource_guard``."""

from __future__ import annotations

from app.models.knowledge_base import KnowledgeBase
from app.services.acl.resource_acl_constants import PERM_MANAGE, PERM_READ, PERM_WRITE, RT_KNOWLEDGE_BASE
from app.services.acl.resource_guard import (
    load_scoped_resource,
    require_manage,
    require_read,
    require_write,
    resource_allowed,
)

__all__ = [
    "knowledge_base_allowed",
    "load_knowledge_base_scoped",
    "require_knowledge_base_manage",
    "require_knowledge_base_read",
    "require_knowledge_base_write",
]


async def knowledge_base_allowed(db, request, kb_id: str, required: int) -> bool:
    return await resource_allowed(db, request, RT_KNOWLEDGE_BASE, kb_id, required)


async def require_knowledge_base_read(db, request, kb: KnowledgeBase) -> KnowledgeBase:
    return await require_read(db, request, RT_KNOWLEDGE_BASE, kb)


async def require_knowledge_base_write(db, request, kb: KnowledgeBase) -> KnowledgeBase:
    return await require_write(db, request, RT_KNOWLEDGE_BASE, kb)


async def require_knowledge_base_manage(db, request, kb: KnowledgeBase) -> KnowledgeBase:
    return await require_manage(db, request, RT_KNOWLEDGE_BASE, kb)


async def load_knowledge_base_scoped(
    db, request, kb_id: str, required: int = PERM_READ
) -> KnowledgeBase:
    return await load_scoped_resource(db, request, RT_KNOWLEDGE_BASE, kb_id, required)
