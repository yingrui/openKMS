"""Wiki page visibility — wiki space ACL only (no per-page sharing)."""

from __future__ import annotations

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wiki_models import WikiPage
from app.services.acl.resource_acl_constants import PERM_READ, PERM_WRITE
from app.services.acl.resource_acl_service import (
    scope_applies,
    wiki_page_visible_via_space,
    wiki_page_writable_via_space,
)

__all__ = [
    "get_wiki_page_in_space",
    "load_wiki_page_scoped",
    "require_wiki_page_by_id_read",
    "require_wiki_page_read",
    "require_wiki_page_write",
    "wiki_page_visible_via_space",
    "wiki_page_writable_via_space",
]


async def require_wiki_page_read(db: AsyncSession, request: Request, page: WikiPage) -> WikiPage:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not await wiki_page_visible_via_space(db, p, sub, page):
        raise HTTPException(status_code=404, detail="Wiki page not found")
    return page


async def require_wiki_page_write(db: AsyncSession, request: Request, page: WikiPage) -> WikiPage:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not scope_applies(p, sub):
        return page
    if not await wiki_page_writable_via_space(db, p, sub, page):
        raise HTTPException(status_code=404, detail="Wiki page not found")
    return page


async def require_wiki_page_by_id_read(
    db: AsyncSession, request: Request, page_id: str
) -> WikiPage:
    row = await db.get(WikiPage, page_id)
    if not row:
        raise HTTPException(status_code=404, detail="Wiki page not found")
    return await require_wiki_page_read(db, request, row)


async def load_wiki_page_scoped(
    db: AsyncSession, request: Request, page_id: str, required: int = PERM_READ
) -> WikiPage:
    row = await db.get(WikiPage, page_id)
    if not row:
        raise HTTPException(status_code=404, detail="Wiki page not found")
    if required & PERM_WRITE:
        return await require_wiki_page_write(db, request, row)
    return await require_wiki_page_read(db, request, row)


async def get_wiki_page_in_space(
    db: AsyncSession,
    request: Request,
    space_id: str,
    page_id: str,
    required: int = PERM_READ,
) -> WikiPage:
    page = await db.get(WikiPage, page_id)
    if not page or page.wiki_space_id != space_id:
        raise HTTPException(status_code=404, detail="Wiki page not found")
    if required & PERM_WRITE:
        return await require_wiki_page_write(db, request, page)
    return await require_wiki_page_read(db, request, page)
