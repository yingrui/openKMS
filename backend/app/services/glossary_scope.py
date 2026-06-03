"""Glossary resource ACL helpers."""

from __future__ import annotations

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.glossary import Glossary
from app.services.resource_acl_constants import PERM_MANAGE, PERM_READ, PERM_WRITE, RT_GLOSSARY
from app.services.resource_acl_service import check_resource_access, scope_applies


async def glossary_allowed(
    db: AsyncSession,
    request: Request,
    glossary_id: str,
    required: int,
) -> bool:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not scope_applies(p, sub):
        return True
    return await check_resource_access(db, p, sub, RT_GLOSSARY, glossary_id, required)


async def require_glossary_read(
    db: AsyncSession, request: Request, glossary: Glossary
) -> Glossary:
    if not await glossary_allowed(db, request, glossary.id, PERM_READ):
        raise HTTPException(status_code=404, detail="Glossary not found")
    return glossary


async def require_glossary_write(
    db: AsyncSession, request: Request, glossary: Glossary
) -> Glossary:
    if not await glossary_allowed(db, request, glossary.id, PERM_WRITE):
        raise HTTPException(status_code=404, detail="Glossary not found")
    return glossary


async def require_glossary_manage(
    db: AsyncSession, request: Request, glossary: Glossary
) -> Glossary:
    if not await glossary_allowed(db, request, glossary.id, PERM_MANAGE):
        raise HTTPException(status_code=404, detail="Glossary not found")
    return glossary
