"""Resolve LLM credentials for embedded wiki agent and qa-agent."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.api_model import ApiModel


async def resolve_agent_llm_config(
    db: AsyncSession,
    *,
    model_id: str | None = None,
) -> dict[str, str] | None:
    """Default chat-completions model, or explicit model id."""
    chosen = model_id or settings.deep_agent_model_id or settings.agent_model_id
    if chosen:
        stmt = (
            select(ApiModel)
            .options(selectinload(ApiModel.provider_rel))
            .where(ApiModel.id == chosen)
        )
    else:
        stmt = (
            select(ApiModel)
            .options(selectinload(ApiModel.provider_rel))
            .where(ApiModel.api_kind == "chat-completions")
            .order_by(ApiModel.is_default_in_category.desc().nullslast())
        )
    result = await db.execute(stmt.limit(1))
    model = result.scalar_one_or_none()
    if not model or not model.provider_rel:
        return None
    if model.api_kind != "chat-completions":
        return None
    prov = model.provider_rel
    return {
        "base_url": prov.base_url or "",
        "api_key": prov.api_key or "",
        "model_name": model.model_name or model.name or "",
    }
