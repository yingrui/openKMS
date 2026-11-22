"""DeepSeek web search, via the Search API meant for agents and code.

DeepSeek also offers `deepseek_web_search` as a *server tool* inside a conversation; its own documentation says to use
this endpoint "to search and fetch web pages in an agent or in your own code", which is what we are. The difference
matters: a server tool runs inside their chat turn, while this returns results to us, so the answer can cite them the way
it cites any other evidence.

`POST {base}/v1/tools/search` → `{results: [{rerank_score, title, url, snippet, summary, content, site_name, date,
authority}]}`. `need_content` is off by default there, which returns an empty `content` — we ask for it, because
`summary` is a blurb and an answer that quotes a blurb cannot be checked.

The handler returns the shape every search connector returns (`title, content, link, media, publish_date`), because its
callers — the connector preview and the Agent Project `web_search` tool — are written against that shape and must not
branch on kind.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.models.connector import Connector
from app.services.data.connectors.connector_catalog import DEEPSEEK_API_BASE_URL, decrypt_secrets_blob

#: The API's own limits. A request outside them is refused, so clamp rather than let the provider do it.
MAX_QUERY_CHARS = 128
MAX_COUNT = 50


def _base(connector: Connector) -> str:
    settings = connector.settings or {}
    configured = str(settings.get("web_search_url") or "").strip()
    if configured:
        return configured.rstrip("/")
    inp = connector.inputs or {}
    base = str(inp.get("api_base_url") or DEEPSEEK_API_BASE_URL).rstrip("/")
    return f"{base}/v1/tools/search"


def _api_key(connector: Connector) -> str:
    secrets = decrypt_secrets_blob(connector.secrets_encrypted)
    key = (secrets.get("DEEPSEEK_API_KEY") or "").strip()
    if not key:
        raise ValueError("DEEPSEEK_API_KEY is not configured for this connector")
    return key


def _merged_inputs(connector: Connector, param_overrides: dict[str, Any] | None) -> dict[str, Any]:
    merged = dict(connector.inputs or {})
    for key, value in (param_overrides or {}).items():
        if key == "api_base_url":
            continue
        merged[key] = value
    return merged


def _payload(connector: Connector, query: str, param_overrides: dict[str, Any] | None) -> dict[str, Any]:
    q = (query or "").strip()
    if not q:
        raise ValueError("search query is required")
    inp = _merged_inputs(connector, param_overrides)
    try:
        count = int(inp.get("count") or 10)
    except (TypeError, ValueError):
        count = 10
    payload: dict[str, Any] = {
        "query": q[:MAX_QUERY_CHARS],
        "count": max(1, min(count, MAX_COUNT)),
    }
    # The blurb is for a UI; an answer needs the text it can quote. A caller may turn this off to save bandwidth.
    need_content = inp.get("need_content")
    if isinstance(need_content, str):
        need_content = need_content.strip().lower() in ("true", "1", "yes")
    payload["need_content"] = True if need_content is None else bool(need_content)
    return payload


async def run_deepseek_web_search(
    connector: Connector,
    query: str,
    *,
    param_overrides: dict[str, Any] | None = None,
    include_debug: bool = False,
) -> dict[str, Any]:
    """One search, in the same shape the Zhipu handler returns."""
    payload = _payload(connector, query, param_overrides)
    endpoint = _base(connector)
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            endpoint,
            json=payload,
            headers={"Authorization": f"Bearer {_api_key(connector)}", "Content-Type": "application/json"},
        )
    if response.status_code >= 400:
        detail = response.text[:200].replace("\n", " ")
        raise ValueError(f"DeepSeek web search failed ({response.status_code}): {detail}")

    data = response.json()
    if not isinstance(data, dict):
        raise ValueError("DeepSeek web search returned an unexpected response shape")

    results = []
    for row in data.get("results") or []:
        if not isinstance(row, dict):
            continue
        results.append(
            {
                "title": str(row.get("title") or ""),
                "content": str(row.get("content") or row.get("summary") or ""),
                "link": str(row.get("url") or ""),
                "media": str(row.get("site_name") or ""),
                "publish_date": str(row.get("date") or ""),
                # Kept because a caller may weight a source by them; nothing renders them as a citation.
                "rerank_score": row.get("rerank_score"),
                "authority": row.get("authority"),
            }
        )

    out: dict[str, Any] = {"query": payload["query"], "results": results}
    if include_debug:
        out["debug"] = {
            "method": "POST",
            "endpoint": endpoint,
            "request_body": payload,
            "status_code": response.status_code,
            "provider_response": data,
        }
    return out
