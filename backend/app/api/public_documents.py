"""Unauthenticated temporary document fetch for external parsers (Baidu file_url)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import iterate_in_threadpool

from app.config import settings
from app.database import get_db
from app.models.document import Document
from app.services.document_fetch_token import verify_document_fetch_token
from app.services.storage import get_object_stream, object_exists

logger = logging.getLogger(__name__)

public_router = APIRouter(prefix="/public/documents", tags=["public-documents"])

_ORIGINAL_MEDIA_TYPES: dict[str, str] = {
    "pdf": "application/pdf",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "bmp": "image/bmp",
    "tif": "image/tiff",
    "tiff": "image/tiff",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "ppt": "application/vnd.ms-powerpoint",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "txt": "text/plain",
    "ofd": "application/octet-stream",
}

_CHUNK_SIZE = 1024 * 1024


def _media_type_for_ext(ext: str) -> str:
    return _ORIGINAL_MEDIA_TYPES.get(ext.lower().lstrip("."), "application/octet-stream")


def _iter_object_chunks(key: str, chunk_size: int = _CHUNK_SIZE):
    """Stream S3 object in chunks (sync generator; used from thread pool)."""
    stream = get_object_stream(key)
    try:
        while True:
            chunk = stream.read(chunk_size)
            if not chunk:
                break
            yield chunk
    finally:
        stream.close()


@public_router.get("/{document_id}/original.{file_ext}")
async def fetch_document_original_public(
    document_id: str,
    file_ext: str,
    exp: int = Query(..., description="Unix expiry from signed URL"),
    sig: str = Query(..., min_length=32, description="HMAC signature"),
    db: AsyncSession = Depends(get_db),
):
    """
    Temporary public GET for original document bytes (200, chunked stream from storage).

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

    logger.info(
        "public_fetch stream start document_id=%s file_hash_prefix=%s ext=%s",
        document_id,
        file_hash[:12],
        ext,
    )
    return StreamingResponse(
        iterate_in_threadpool(_iter_object_chunks(key)),
        media_type=_media_type_for_ext(ext),
    )
