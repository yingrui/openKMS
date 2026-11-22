"""Which connector, if any, can search the web.

The lookup lives here rather than in the internal API because two callers need it: the endpoint that runs a search, and
the tools catalogue that tells a screen whether the capability is usable. Importing one API module from the other would
close a cycle across `app/api`.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.connector import Connector
from app.services.data.connectors.connector_catalog import CATEGORY_SEARCH_TOOL, get_kind_spec
from app.services.data.connectors.deepseek import run_deepseek_web_search
from app.services.data.connectors.zhipu import run_zhipu_web_search

#: One handler per provider kind. Every handler takes `(connector, query, *, param_overrides, include_debug)` and returns
#: `{query, results: [{title, content, link, media, publish_date}]}` — the shape the connector preview and the Agent
#: Project `web_search` tool are written against.
_HANDLERS = {
    "zhipu_web_search": run_zhipu_web_search,
    "deepseek_web_search": run_deepseek_web_search,
}

#: Every kind whose category is `search_tool` can answer a web search; the list comes from the catalogue so a new
#: provider joins without touching this module.


async def web_search_connector(db: AsyncSession) -> Connector | None:
    """The enabled connector that can search the web, if the deployment has one."""
    return (
        await db.execute(
            select(Connector)
            .where(Connector.kind.in_(search_kinds()), Connector.enabled.is_(True))
            .order_by(Connector.created_at)
            .limit(1)
        )
    ).scalars().first()


def search_kinds() -> tuple[str, ...]:
    """Connector kinds that provide web search, read from the catalogue."""
    from app.services.data.connectors.connector_catalog import CONNECTOR_KINDS

    return tuple(
        kind for kind, spec in CONNECTOR_KINDS.items() if spec.category == CATEGORY_SEARCH_TOOL
    )


async def run_web_search(connector: Connector, query: str, limit: int) -> list[dict[str, object]]:
    """One search through whichever provider this connector names.

    Every provider hands back `{title, url, content, publisher, published_at}` — the caller must not branch on kind when
    it serves a result to a model.
    """
    spec = get_kind_spec(connector.kind)
    if spec is None or spec.category != CATEGORY_SEARCH_TOOL:
        raise ValueError(f"Connector `{connector.kind}` cannot search the web")

    handler = _HANDLERS.get(connector.kind)
    if handler is None:  # pragma: no cover - the catalogue decides, so an unhandled kind is a missing branch
        raise ValueError(f"Connector `{connector.kind}` has no search implementation")
    data = await handler(connector, query, param_overrides={"count": limit})
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
    ]

    return [item for item in results if item.get("url")][:limit]
