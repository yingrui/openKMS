"""The runtime's tool catalogue, proxied for the agent configuration screen.

Tools are code: their names, parameters and descriptions are the function-calling contract, so the screen must show
what the model is given rather than a hand-written summary of it. The qa-agent owns that definition and serves it at
`/tools`; this module only forwards it and keeps it for a moment, because it changes when the service is redeployed,
not when someone clicks around.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.config import settings
from app.database import get_db
from app.services.content.knowledge_bases.qa_agent_proxy import resolve_agent_url

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/workforce/tools",
    tags=["workforce-tools"],
    dependencies=[Depends(require_auth)],
)

#: Long enough to keep the screen snappy, short enough that a redeployed qa-agent shows up without a restart.
CACHE_TTL_SECONDS = 60.0

_cache: tuple[float, dict[str, Any]] | None = None


def _cached() -> dict[str, Any] | None:
    if _cache is None:
        return None
    stored_at, payload = _cache
    return payload if time.monotonic() - stored_at < CACHE_TTL_SECONDS else None


@router.get("")
async def tool_catalog(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """The capabilities, their tools, and the code-execution policy.

    A knowledge base is fetched only to resolve the deployment's agent URL; with `OPENKMS_QA_AGENT_URL` set, nothing
    is read at all. That is why an agent with no knowledge source yet still shows a tool list.
    """
    global _cache
    cached = _cached()
    if cached is not None:
        return cached

    url = settings.qa_agent_url or await _url_from_any_kb(db)
    if not url:
        raise HTTPException(status_code=503, detail="No QA agent URL configured for this deployment")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{url.rstrip('/')}/tools")
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPError as e:
        logger.error("tool catalogue could not be read from %s: %s", url, e)
        raise HTTPException(status_code=502, detail="Could not read the tool catalogue") from e

    _cache = (time.monotonic(), payload)
    return payload


async def _url_from_any_kb(db: AsyncSession) -> str | None:
    """Older deployments set the agent URL per knowledge base; any row with one answers for the deployment."""
    from sqlalchemy import select

    from app.models.knowledge_base import KnowledgeBase

    rows = (
        await db.execute(
            select(KnowledgeBase).where(KnowledgeBase.agent_url.is_not(None)).limit(1)
        )
    ).scalars().first()
    return resolve_agent_url(rows) if rows is not None else None
