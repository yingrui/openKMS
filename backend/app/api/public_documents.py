"""Unauthenticated temporary document fetch for external parsers (Baidu file_url)."""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.document import Document
from app.services.document_fetch_token import verify_document_fetch_token
from app.services.storage import get_redirect_url, object_exists

logger = logging.getLogger(__name__)

public_router = APIRouter(prefix="/public/documents", tags=["public-documents"])


@public_router.get("/{document_id}/original.{file_ext}")
async def fetch_document_original_public(
    document_id: str,
    file_ext: str,
    exp: int = Query(..., description="Unix expiry from signed URL"),
    sig: str = Query(..., min_length=32, description="HMAC signature"),
    db: AsyncSession = Depends(get_db),
):
    """
    Temporary public GET for original document bytes (302 → presigned S3 / bucket proxy).

    Used by Baidu Cloud ``file_url`` mode. No session auth; ``exp`` + ``sig`` must match
    values minted via ``GET /internal-api/documents/{id}/baidu-fetch-url``.
    """
    ext = file_ext.lower().lstrip(".")
    doc = await db.get(Document, document_id)
    if not doc or not doc.file_hash:
        logger.warning("public_fetch document not found document_id=%s", document_id)
        raise HTTPException(status_code=404, detail="Document not found")

    file_hash = doc.file_hash
    if not verify_document_fetch_token(
        document_id, file_hash, ext, exp=exp, sig=sig
    ):
        raise HTTPException(status_code=403, detail="Invalid or expired link")

    key = f"{file_hash}/original.{ext}"
    if not settings.storage_enabled:
        logger.error("public_fetch storage disabled document_id=%s", document_id)
        raise HTTPException(status_code=503, detail="Storage not configured")
    if not object_exists(key):
        logger.warning(
            "public_fetch object missing document_id=%s key_prefix=%s",
            document_id,
            f"{file_hash[:12]}/original.{ext}",
        )
        raise HTTPException(status_code=404, detail="File not found")

    remaining = max(60, exp - int(time.time()))
    redirect_url = get_redirect_url(key, expires_in=min(remaining, settings.baidu_external_fetch_ttl_seconds))
    logger.info(
        "public_fetch redirect document_id=%s file_hash_prefix=%s ext=%s remaining_ttl=%s",
        document_id,
        file_hash[:12],
        ext,
        remaining,
    )
    return RedirectResponse(url=redirect_url, status_code=302)
