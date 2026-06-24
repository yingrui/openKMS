"""Document visibility — channel ACL only (no per-document sharing)."""

from __future__ import annotations

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.services.acl.resource_acl_constants import PERM_READ, PERM_WRITE
from app.services.acl.resource_acl_service import (
    channel_allowed_for_document_upload,
    document_visible_via_channel,
    scoped_document_predicate,
    scope_applies,
)

__all__ = [
    "document_list_predicate",
    "document_passes_scoped_predicate",
    "document_visible_via_channel",
    "load_document_scoped",
    "require_document_by_id_read",
    "require_document_read",
    "require_document_write",
    "scoped_document_predicate",
]

document_passes_scoped_predicate = document_visible_via_channel


async def require_document_read(db: AsyncSession, request: Request, doc: Document) -> Document:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not await document_visible_via_channel(db, p, sub, doc):
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


async def require_document_write(db: AsyncSession, request: Request, doc: Document) -> Document:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not scope_applies(p, sub):
        return doc
    if not doc.channel_id or not await channel_allowed_for_document_upload(
        db, p, sub, doc.channel_id
    ):
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


async def require_document_by_id_read(
    db: AsyncSession, request: Request, document_id: str
) -> Document:
    row = await db.get(Document, document_id)
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    return await require_document_read(db, request, row)


async def load_document_scoped(
    db: AsyncSession, request: Request, document_id: str, required: int = PERM_READ
) -> Document:
    row = await db.get(Document, document_id)
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    if required & PERM_WRITE:
        return await require_document_write(db, request, row)
    return await require_document_read(db, request, row)


async def document_list_predicate(db: AsyncSession, request: Request):
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    return await scoped_document_predicate(db, p, sub) if isinstance(sub, str) else None
