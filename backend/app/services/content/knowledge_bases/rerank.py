"""Resolving a rerank model: endpoint, key and model name for one knowledge base.

A reranker used to be a deployment environment variable plus the chat model's key. That made "which reranker" a property
of the host rather than of the corpus, and it could not be verified from the product. Here a reranker is an `ApiModel`
with `api_kind="rerank"`, managed in the same registry as chat and embedding models, so a knowledge base names one and
the key comes from that model's provider.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.api_model import ApiModel

#: The API kind a model must have to be usable as a reranker.
RERANK_KIND = "rerank"


@dataclass(frozen=True)
class RerankTargets:
    """Where to send a rerank request: everything the client needs, and nothing it does not."""

    base_url: str
    model_name: str
    api_key: str

    def as_response(self) -> dict[str, str]:
        return {
            "base_url": self.base_url,
            "model_name": self.model_name,
            "api_key": self.api_key,
        }


async def resolve_rerank_model(
    db: AsyncSession, *, model_id: str | None = None
) -> RerankTargets | None:
    """One rerank model by id, or the default one when no id is given.

    `None` means "this deployment has no reranker" — the caller must then skip the stage and say so, rather than fail an
    answer over an optional improvement.
    """
    stmt = (
        select(ApiModel)
        .options(selectinload(ApiModel.provider_rel))
        .where(ApiModel.api_kind == RERANK_KIND)
    )
    if model_id:
        stmt = stmt.where(ApiModel.id == model_id)
    else:
        stmt = stmt.order_by(ApiModel.is_default_in_category.desc().nullslast())
    model = (await db.execute(stmt.limit(1))).scalar_one_or_none()
    if model is None or model.provider_rel is None:
        return None
    provider = model.provider_rel
    base_url = (provider.base_url or "").strip().rstrip("/")
    model_name = (model.model_name or model.name or "").strip()
    if not base_url or not model_name:
        return None
    return RerankTargets(
        base_url=base_url,
        model_name=model_name,
        api_key=(provider.api_key or "").strip(),
    )
