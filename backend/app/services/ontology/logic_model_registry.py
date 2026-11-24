"""Turn a flow node's `model_id` into a pydantic-ai model, using the platform's model registry.

The registry (`api_models` under `api_providers`) is already how article review and metadata extraction pick a model,
so a Logic function reuses it instead of inventing settings: same providers, same keys, same "which model is default".
"""

from __future__ import annotations

from typing import Any

import httpx
from openai import AsyncOpenAI
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.profiles.openai import OpenAIModelProfile
from pydantic_ai.providers.openai import OpenAIProvider
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.api_model import ApiModel
from app.services.ontology.logic_runtime import DEFAULT_NODE_TIMEOUT_S, FlowError

CHAT_KIND = "chat-completions"

# Several OpenAI-compatible providers reject `response_format: json_schema`; the same profile the content
# reviewers use keeps them working with json_object + a prompted schema.
_COMPAT_PROFILE = OpenAIModelProfile(
    supports_json_schema_output=False,
    supports_json_object_output=True,
)


async def resolve_model(db: AsyncSession, model_id: str | None) -> Any:
    """A configured model, or the default chat model when the node does not name one."""
    stmt = select(ApiModel).options(selectinload(ApiModel.provider_rel))
    if model_id:
        stmt = stmt.where(ApiModel.id == model_id)
    else:
        stmt = stmt.where(
            ApiModel.api_kind == CHAT_KIND, ApiModel.is_default_in_category.is_(True)
        )
    row = (await db.execute(stmt)).scalars().first()
    if not row:
        detail = f"model '{model_id}'" if model_id else f"a default '{CHAT_KIND}' model"
        raise FlowError(f"no usable {detail} — configure one under models/providers")

    provider = row.provider_rel
    base_url = (provider.base_url or "").rstrip("/")
    if base_url and not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"
    client = AsyncOpenAI(
        base_url=base_url,
        api_key=provider.api_key or "no-key",
        # A node that never answers should fail as a node, not hang the whole execution.
        timeout=httpx.Timeout(DEFAULT_NODE_TIMEOUT_S, connect=10.0),
        max_retries=0,
    )
    return OpenAIChatModel(
        row.model_name or row.name,
        provider=OpenAIProvider(openai_client=client),
        profile=_COMPAT_PROFILE,
    )
