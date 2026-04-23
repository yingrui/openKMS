"""Resolve OpenAI-compatible LLM config for the embedded agent from api_models."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.api_model import ApiModel


async def resolve_agent_llm_config(db: AsyncSession) -> dict[str, str] | None:
    """Return base_url, api_key, model_name for ChatOpenAI, or None if no model is available."""
    q = select(ApiModel).options(selectinload(ApiModel.provider_rel)).where(ApiModel.category == "llm")
    if settings.agent_model_id:
        q = q.where(ApiModel.id == settings.agent_model_id)
    else:
        q = q.order_by(ApiModel.is_default_in_category.desc().nullslast())
    q = q.limit(1)
    r = await db.execute(q)
    m = r.scalar_one_or_none()
    if not m or not m.provider_rel:
        return None
    prov = m.provider_rel
    return {
        "base_url": prov.base_url,
        "api_key": (prov.api_key or "no-key").strip() or "no-key",
        "model_name": (m.model_name or m.name or "gpt-4o-mini").strip(),
    }
