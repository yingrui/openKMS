"""Web search, as one tool among the others.

It leaves the tenant's knowledge boundary, so it is a capability an agent enables, not something switched on by being
useful. The credential is not here: the deployment already has a `zhipu_web_search` connector, and the backend runs the
call. This module only decides *when* to search and how to shape the answer.

An unconfigured deployment returns an error the model can act on ("not configured") instead of an empty result, which
reads like "the web has nothing".
"""

from __future__ import annotations

import json
from typing import Annotated, Any

import httpx
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from ..backend_defaults import _post_json
from ..config import settings

#: Result ceiling for one search. A model that needs more should refine the query, not page through the web.
DEFAULT_MAX_RESULTS = 5

#: Said in the payload as well as in the description: the model copies what it reads.
EXTERNAL_NOTE = (
    "These results are external to the knowledge base. Cite the URL; do not attribute them to a document."
)


@tool
def search_web(
    query: Annotated[str, "What to look for; a question or a few keywords"],
    _config: RunnableConfig,
    max_results: Annotated[int, "How many results to return"] = DEFAULT_MAX_RESULTS,
) -> str:
    """Search the public web. Results are outside this knowledge base: cite them as external, never as a document."""
    limit = max(1, min(int(max_results or DEFAULT_MAX_RESULTS), 10))
    base = (settings.openkms_backend_url or "").strip().rstrip("/")
    if not base:
        return "Error: web search needs the backend URL, and this deployment has none configured."
    payload = {"query": query, "limit": limit}
    try:
        data = _post_json(f"{base}/internal-api/web-search", what="web search", payload=payload)
    except RuntimeError as exc:
        # 404 = no connector, 502 = the provider refused. Both are answers the model should pass on, not silence.
        return f"Error: {exc}"
    except httpx.HTTPError as exc:
        return f"Error: web search failed ({exc.__class__.__name__})."
    results = list((data or {}).get("results") or [])
    return json.dumps(
        {
            "query": query,
            "connector": (data or {}).get("connector"),
            "results": results[:limit],
            "note": EXTERNAL_NOTE,
        },
        ensure_ascii=False,
    )


web_search_tools: list[Any] = [search_web]
