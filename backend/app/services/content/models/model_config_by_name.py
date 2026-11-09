"""Resolve provider credentials for a named ApiModel row (internal CLI/worker routes)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.api_model import VALID_API_KINDS, ApiModel


async def resolve_model_config_by_name(
    db: AsyncSession,
    *,
    model_name: str,
    api_kind: str,
) -> dict[str, str] | None:
    """Return base_url, api_key, model_name for the first row matching api_kind + model_name."""
    if api_kind not in VALID_API_KINDS:
        return None
    stmt = (
        select(ApiModel)
        .options(selectinload(ApiModel.provider_rel))
        .where(ApiModel.api_kind == api_kind, ApiModel.model_name == model_name)
        .limit(1)
    )
    result = await db.execute(stmt)
    model = result.scalar_one_or_none()
    if not model or not model.provider_rel:
        return None
    prov = model.provider_rel
    return {
        "base_url": prov.base_url or "",
        "api_key": prov.api_key or "",
        "model_name": model.model_name or model.name or "",
    }
