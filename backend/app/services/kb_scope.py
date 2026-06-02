"""Knowledge base resource ACL helpers."""

from __future__ import annotations

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge_base import KnowledgeBase
from app.services.resource_acl_constants import PERM_MANAGE, PERM_READ, PERM_WRITE, RT_KNOWLEDGE_BASE
from app.services.resource_acl_service import check_resource_access, scope_applies


async def knowledge_base_allowed(
    db: AsyncSession,
    request: Request,
    kb_id: str,
    required: int,
) -> bool:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not scope_applies(p, sub):
        return True
    return await check_resource_access(db, p, sub, RT_KNOWLEDGE_BASE, kb_id, required)


async def require_knowledge_base_read(
    db: AsyncSession, request: Request, kb: KnowledgeBase
) -> KnowledgeBase:
    if not await knowledge_base_allowed(db, request, kb.id, PERM_READ):
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return kb


async def require_knowledge_base_write(
    db: AsyncSession, request: Request, kb: KnowledgeBase
) -> KnowledgeBase:
    if not await knowledge_base_allowed(db, request, kb.id, PERM_WRITE):
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return kb


async def require_knowledge_base_manage(
    db: AsyncSession, request: Request, kb: KnowledgeBase
) -> KnowledgeBase:
    if not await knowledge_base_allowed(db, request, kb.id, PERM_MANAGE):
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return kb
