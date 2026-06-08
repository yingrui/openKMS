"""Dispatch search_tool connector execution by kind."""

from __future__ import annotations

from typing import Any

from app.models.connector import Connector
from app.services.connector_catalog import CATEGORY_SEARCH_TOOL, get_kind_spec
from app.services.connector_search.zhipu import run_zhipu_web_search


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

    if connector.kind == "zhipu_web_search":
        return await run_zhipu_web_search(
            connector,
            query,
            param_overrides=param_overrides,
            include_debug=include_debug,
        )
    raise ValueError(f"No search handler for kind '{connector.kind}'")
