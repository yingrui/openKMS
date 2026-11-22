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
from app.models.connector import Connector
from app.services.data.connectors.connector_catalog import CATEGORY_SEARCH_TOOL, get_kind_spec
from app.services.data.connectors.web_search import run_web_search, web_search_connector

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
    #: The connector the agent bound. Absent falls back to the deployment's first enabled one, which is what a caller
    #: without an agent (a CLI, a test) needs.
    connector_id: str | None = None


async def _connector_for(db: AsyncSession, connector_id: str | None):
    """The bound connector, or the deployment default when a caller names none.

    A bound connector that is disabled or of the wrong kind is *not* silently replaced: the agent asked for that one.
    """
    if connector_id:
        row = await db.get(Connector, connector_id)
        spec = get_kind_spec(row.kind) if row is not None else None
        if row is None or not row.enabled or spec is None or spec.category != CATEGORY_SEARCH_TOOL:
            return None
        return row
    return await web_search_connector(db)


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
    connector = await _connector_for(db, body.connector_id)
    if connector is None:
        raise HTTPException(status_code=404, detail="Web search is not configured for this agent")
    limit = max(1, min(body.limit, MAX_RESULTS))
    try:
        results = await run_web_search(connector, body.query, limit)
    except ValueError as exc:
        # A provider failure is not a "no result": say what happened so the model can report it.
        logger.warning("web search failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Providers may ignore the count they were given; the cap is this endpoint's promise, not theirs.
    return {"query": body.query, "connector": connector.name, "results": results[:limit]}
