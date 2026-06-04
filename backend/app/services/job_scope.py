"""Job visibility — resolve procrastinate job args to document or KB ACL."""

from __future__ import annotations

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.document_scope import load_document_scoped
from app.services.kb_scope import load_knowledge_base_scoped
from app.services.resource_acl_constants import PERM_READ, PERM_WRITE
from app.services.resource_acl_service import scope_applies

__all__ = ["job_args_allowed", "require_job_args_access"]


async def job_args_allowed(
    request: Request,
    db: AsyncSession,
    args: dict,
    *,
    require_write: bool = False,
) -> bool:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not scope_applies(p, sub):
        return True
    perm = PERM_WRITE if require_write else PERM_READ
    doc_id = args.get("document_id")
    kb_id = args.get("knowledge_base_id")
    if doc_id and isinstance(doc_id, str):
        try:
            await load_document_scoped(db, request, doc_id, perm)
            return True
        except HTTPException:
            return False
    if kb_id and isinstance(kb_id, str):
        try:
            await load_knowledge_base_scoped(db, request, kb_id, perm)
            return True
        except HTTPException:
            return False
    return False


async def require_job_args_access(
    request: Request,
    db: AsyncSession,
    args: dict,
    *,
    require_write: bool = False,
) -> None:
    if not await job_args_allowed(request, db, args, require_write=require_write):
        raise HTTPException(status_code=404, detail="Job not found")
