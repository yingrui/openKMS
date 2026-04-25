"""Resolve default VLM URL, model name, and API key for PaddleOCR-VL / openkms-cli."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import case, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.api_model import ApiModel


@dataclass(frozen=True)
class DocumentParseVlmDefaults:
    """Defaults for document parse; api_key only when a vl/ocr ApiModel row exists (provider secret)."""

    base_url: str | None
    model_name: str | None
    api_key: str | None


async def get_document_parse_vlm_defaults(db: AsyncSession) -> DocumentParseVlmDefaults:
    """Pick default vl/ocr model from DB, else server OPENKMS_PADDLEOCR_VL_* / OPENKMS_VLM_* (no env API key)."""
    stmt = (
        select(ApiModel)
        .options(selectinload(ApiModel.provider_rel))
        .where(ApiModel.category.in_(("vl", "ocr")))
        .order_by(ApiModel.is_default_in_category.desc().nullslast(), ApiModel.created_at.asc())
        .limit(1)
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if row and row.provider_rel:
        prov = row.provider_rel
        base = (prov.base_url or "").strip().rstrip("/") or None
        model = (row.model_name or row.name or "").strip() or None
        key = (prov.api_key or "").strip() or None
        return DocumentParseVlmDefaults(base_url=base, model_name=model, api_key=key or None)
    url = (settings.paddleocr_vl_server_url or settings.vlm_url or "").strip().rstrip("/") or None
    model = (settings.paddleocr_vl_model or settings.vlm_model or "").strip() or None
    return DocumentParseVlmDefaults(base_url=url, model_name=model, api_key=None)


async def get_document_parse_vlm_defaults_for_cli(
    db: AsyncSession, requested_model_name: str | None
) -> DocumentParseVlmDefaults:
    """If requested_model_name matches a vl/ocr ApiModel (by model_name or name), use it; else defaults."""
    q = (requested_model_name or "").strip()
    if not q:
        return await get_document_parse_vlm_defaults(db)

    stmt = (
        select(ApiModel)
        .options(selectinload(ApiModel.provider_rel))
        .where(
            ApiModel.category.in_(("vl", "ocr")),
            or_(ApiModel.model_name == q, ApiModel.name == q),
        )
        .order_by(
            case((ApiModel.model_name == q, 0), else_=1),
            ApiModel.is_default_in_category.desc().nullslast(),
            ApiModel.created_at.asc(),
        )
        .limit(1)
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if row and row.provider_rel:
        prov = row.provider_rel
        base = (prov.base_url or "").strip().rstrip("/") or None
        model = (row.model_name or row.name or "").strip() or None
        key = (prov.api_key or "").strip() or None
        return DocumentParseVlmDefaults(base_url=base, model_name=model, api_key=key or None)

    return await get_document_parse_vlm_defaults(db)
