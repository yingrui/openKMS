"""Internal document routes for workers / openkms-cli."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_internal_client
from app.config import settings
from app.database import get_db
from app.models.document import Document
from app.services.document_fetch_token import (
    build_public_document_fetch_url,
    redact_fetch_url_for_log,
)
from app.services.storage import object_exists

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/internal-api/documents",
    tags=["internal-documents"],
    dependencies=[Depends(require_internal_client)],
)


class BaiduFetchUrlResponse(BaseModel):
    url: str
    expires_at: datetime
    upload_mode: str = "file_url"
    file_ext: str
    file_hash: str


@router.get("/{document_id}/baidu-fetch-url", response_model=BaiduFetchUrlResponse)
async def get_baidu_fetch_url(
    document_id: str,
    file_ext: str = Query(..., min_length=1, description="Original extension without dot, e.g. pdf"),
    ttl_seconds: int | None = Query(
        default=None,
        ge=60,
        le=86_400,
        description="Optional TTL override (seconds); capped by server default",
    ),
    db: AsyncSession = Depends(get_db),
):
    """Mint a temporary public URL for Baidu ``file_url`` submit (requires OPENKMS_FRONTEND_URL)."""
    ext = file_ext.lower().lstrip(".")
    doc = await db.get(Document, document_id)
    if not doc or not doc.file_hash:
        raise HTTPException(status_code=404, detail="Document not found")

    frontend = (settings.frontend_url or "").strip().rstrip("/")
    if not frontend or frontend.startswith("http://localhost"):
        logger.warning(
            "baidu_fetch_url frontend may not be public document_id=%s frontend=%s",
            document_id,
            frontend,
        )

    if not settings.storage_enabled:
        raise HTTPException(status_code=503, detail="Storage not configured")

    key = f"{doc.file_hash}/original.{ext}"
    if not object_exists(key):
        raise HTTPException(
            status_code=404,
            detail=f"Original object not found at {doc.file_hash}/original.{ext}",
        )

    effective_ttl = ttl_seconds
    if effective_ttl is not None:
        effective_ttl = min(effective_ttl, settings.baidu_external_fetch_ttl_seconds)
    url, exp_unix = build_public_document_fetch_url(
        document_id,
        doc.file_hash,
        ext,
        ttl_seconds=effective_ttl,
    )
    expires_at = datetime.fromtimestamp(exp_unix, tz=timezone.utc)
    logger.info(
        "baidu_fetch_url issued document_id=%s file_hash_prefix=%s ext=%s url=%s",
        document_id,
        doc.file_hash[:12],
        ext,
        redact_fetch_url_for_log(url),
    )
    return BaiduFetchUrlResponse(
        url=url,
        expires_at=expires_at,
        file_ext=ext,
        file_hash=doc.file_hash,
    )
