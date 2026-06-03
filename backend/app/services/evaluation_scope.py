"""Evaluation resource ACL helpers."""

from __future__ import annotations

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.evaluation import Evaluation
from app.services.resource_acl_constants import PERM_MANAGE, PERM_READ, PERM_WRITE, RT_EVALUATION
from app.services.resource_acl_service import check_resource_access, scope_applies


async def evaluation_allowed(
    db: AsyncSession,
    request: Request,
    evaluation_id: str,
    required: int,
) -> bool:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not scope_applies(p, sub):
        return True
    return await check_resource_access(db, p, sub, RT_EVALUATION, evaluation_id, required)


async def require_evaluation_read(
    db: AsyncSession, request: Request, ev: Evaluation
) -> Evaluation:
    if not await evaluation_allowed(db, request, ev.id, PERM_READ):
        raise HTTPException(status_code=404, detail="Evaluation not found")
    return ev


async def require_evaluation_write(
    db: AsyncSession, request: Request, ev: Evaluation
) -> Evaluation:
    if not await evaluation_allowed(db, request, ev.id, PERM_WRITE):
        raise HTTPException(status_code=404, detail="Evaluation not found")
    return ev


async def require_evaluation_manage(
    db: AsyncSession, request: Request, ev: Evaluation
) -> Evaluation:
    if not await evaluation_allowed(db, request, ev.id, PERM_MANAGE):
        raise HTTPException(status_code=404, detail="Evaluation not found")
    return ev
