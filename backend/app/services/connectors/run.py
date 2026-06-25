"""Dispatch connector execution by kind and category."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.connector import Connector
from app.services.connectors.connector_catalog import CATEGORY_SEARCH_TOOL, get_kind_spec
from app.services.connectors.tushare.sync import sync_tushare_connector
from app.services.connectors.zhipu import run_zhipu_web_search

SearchHandler = Callable[..., Awaitable[dict[str, Any]]]
SyncHandler = Callable[..., Awaitable[dict[str, int]]]

_SEARCH_HANDLERS: dict[str, SearchHandler] = {
    "zhipu_web_search": run_zhipu_web_search,
}

_SYNC_HANDLERS: dict[str, SyncHandler] = {
    "tushare": sync_tushare_connector,
}


async def run_connector_search(
    connector: Connector,
    query: str,
    *,
    param_overrides: dict | None = None,
    include_debug: bool = False,
) -> dict[str, Any]:
    if not connector.enabled:
        raise ValueError("Connector is disabled")
    spec = get_kind_spec(connector.kind)
    if not spec:
        raise ValueError(f"Unknown connector kind '{connector.kind}'")
    if spec.category != CATEGORY_SEARCH_TOOL:
        raise ValueError(f"Connector kind '{connector.kind}' is not a search_tool")

    handler = _SEARCH_HANDLERS.get(connector.kind)
    if not handler:
        raise ValueError(f"No search handler for kind '{connector.kind}'")
    return await handler(
        connector,
        query,
        param_overrides=param_overrides,
        include_debug=include_debug,
    )


async def run_connector_sync_for_row(
    db: AsyncSession,
    connector: Connector,
    *,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, int]:
    if not connector.enabled:
        raise ValueError("Connector is disabled")
    handler = _SYNC_HANDLERS.get(connector.kind)
    if not handler:
        raise ValueError(f"No sync handler for kind '{connector.kind}'")
    return await handler(db, connector, start_date=start_date, end_date=end_date)
