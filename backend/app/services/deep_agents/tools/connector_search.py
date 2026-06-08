"""Search tools backed by search_tool connectors."""

from __future__ import annotations

import json

from langchain_core.tools import StructuredTool
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.connector import Connector
from app.services.connector_catalog import CATEGORY_SEARCH_TOOL, get_kind_spec
from app.services.connector_search.run import run_connector_search


async def make_connector_search_tools(db: AsyncSession, connector_id: str) -> list[StructuredTool]:
    row = await db.get(Connector, connector_id)
    if not row or not row.enabled:
        return []
    spec = get_kind_spec(row.kind)
    if not spec or spec.category != CATEGORY_SEARCH_TOOL:
        return []

    async def _web_search(query: str) -> str:
        """Search the web for current information using the project's configured search connector."""
        result = await run_connector_search(row, query)
        return json.dumps(result, ensure_ascii=False)[:48_000]

    return [
        StructuredTool.from_function(
            coroutine=_web_search,
            name="web_search",
            description=(
                "Search the web for up-to-date information. "
                "Returns JSON with query, optional search_intent, and results (title, content, link, media, publish_date)."
            ),
        )
    ]
