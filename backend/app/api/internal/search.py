"""Web search for the qa-agent, run through the connector the deployment already configured.

There is no second place to put an API key: the `zhipu_web_search` connector holds the credential, its base URL and its
engine settings, and the Connectors screen is where an operator manages it. The qa-agent only decides *when* to search,
which is an agent-level decision, and this endpoint answers "do it" or "not configured" — never an empty list, which a
model would read as "the web has nothing".
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_internal_client
from app.database import get_db
from app.services.data.connectors.web_search import web_search_connector
from app.services.data.connectors.zhipu import run_zhipu_web_search

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/internal-api",
    tags=["internal-search"],
    dependencies=[Depends(require_internal_client)],
)

MAX_RESULTS = 10


class WebSearchRequest(BaseModel):
    query: str = Field(min_length=1)
    limit: int = 5


@router.get("/web-search/available")
async def web_search_available(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Whether this deployment can search the web at all, so a screen can disable a switch that would do nothing."""
    connector = await web_search_connector(db)
    return {
        "available": connector is not None,
        "connector": connector.name if connector is not None else None,
    }


@router.post("/web-search")
async def web_search(body: WebSearchRequest, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    connector = await web_search_connector(db)
    if connector is None:
        raise HTTPException(status_code=404, detail="Web search is not configured for this deployment")
    limit = max(1, min(body.limit, MAX_RESULTS))
    try:
        data = await run_zhipu_web_search(connector, body.query)
    except ValueError as exc:
        # A provider failure is not a "no result": say what happened so the model can report it.
        logger.warning("web search failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    results = [
        {
            "title": str(item.get("title") or ""),
            "url": str(item.get("link") or ""),
            "content": str(item.get("content") or ""),
            "publisher": str(item.get("media") or ""),
            "published_at": str(item.get("publish_date") or ""),
        }
        for item in (data.get("results") or [])
        if isinstance(item, dict)
    ][:limit]
    return {"query": body.query, "connector": connector.name, "results": results}
