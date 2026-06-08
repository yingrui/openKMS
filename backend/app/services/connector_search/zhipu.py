"""Zhipu Web Search API (search_tool kind)."""

from __future__ import annotations

from typing import Any

import httpx

from app.models.connector import Connector
from app.services.connector_catalog import (
    CATEGORY_SEARCH_TOOL,
    ZHIPU_API_BASE_URL,
    decrypt_secrets_blob,
)

_SEARCH_ENGINES = frozenset(
    {"search_std", "search_pro", "search_pro_sogou", "search_pro_quark"}
)
_RECENCY = frozenset({"oneDay", "oneWeek", "oneMonth", "oneYear", "noLimit"})
_CONTENT_SIZE = frozenset({"medium", "high"})


def _inputs(connector: Connector) -> dict[str, Any]:
    return dict(connector.inputs or {})


def _merged_inputs(connector: Connector, param_overrides: dict[str, Any] | None) -> dict[str, Any]:
    merged = _inputs(connector)
    if not param_overrides:
        return merged
    for key, value in param_overrides.items():
        if key == "api_base_url":
            continue
        merged[key] = value
    return merged


def _search_endpoint(connector: Connector) -> str:
    settings = connector.settings or {}
    url = str(settings.get("web_search_url") or "").strip()
    if url:
        return url.rstrip("/")
    inp = _inputs(connector)
    base = str(inp.get("api_base_url") or ZHIPU_API_BASE_URL).rstrip("/")
    return f"{base}/web_search"


def _normalize_zhipu_response(data: dict[str, Any], query: str) -> dict[str, Any]:
    results: list[dict[str, str]] = []
    for row in data.get("search_result") or []:
        if not isinstance(row, dict):
            continue
        results.append(
            {
                "title": str(row.get("title") or ""),
                "content": str(row.get("content") or ""),
                "link": str(row.get("link") or ""),
                "media": str(row.get("media") or ""),
                "icon": str(row.get("icon") or ""),
                "refer": str(row.get("refer") or ""),
                "publish_date": str(row.get("publish_date") or ""),
            }
        )

    intent_out: list[dict[str, str]] = []
    for item in data.get("search_intent") or []:
        if not isinstance(item, dict):
            continue
        intent_out.append(
            {
                "query": str(item.get("query") or ""),
                "intent": str(item.get("intent") or ""),
                "keywords": str(item.get("keywords") or ""),
            }
        )

    out: dict[str, Any] = {
        "query": query,
        "search_intent": intent_out,
        "results": results,
    }

    provider: dict[str, Any] = {}
    if data.get("id") is not None:
        provider["id"] = str(data.get("id"))
    if data.get("created") is not None:
        try:
            provider["created"] = int(data.get("created"))
        except (TypeError, ValueError):
            pass
    if data.get("request_id") is not None:
        provider["request_id"] = str(data.get("request_id"))
    if provider:
        out["provider"] = provider

    return out


def _build_zhipu_payload(inp: dict[str, Any], query: str) -> dict[str, Any]:
    q = (query or "").strip()
    if not q:
        raise ValueError("search query is required")
    if len(q) > 70:
        q = q[:70]

    engine = str(inp.get("search_engine") or "search_std")
    if engine not in _SEARCH_ENGINES:
        raise ValueError(f"Invalid search_engine '{engine}'")

    search_intent = inp.get("search_intent")
    if isinstance(search_intent, str):
        search_intent = search_intent.strip().lower() in ("true", "1", "yes")
    search_intent = bool(search_intent)

    count_raw = inp.get("count", 10)
    try:
        count = int(count_raw)
    except (TypeError, ValueError):
        count = 10
    count = max(1, min(50, count))

    recency = str(inp.get("search_recency_filter") or "noLimit")
    if recency not in _RECENCY:
        recency = "noLimit"

    content_size = str(inp.get("content_size") or "medium")
    if content_size not in _CONTENT_SIZE:
        content_size = "medium"

    payload: dict[str, Any] = {
        "search_query": q,
        "search_engine": engine,
        "search_intent": search_intent,
        "count": count,
        "search_recency_filter": recency,
        "content_size": content_size,
    }
    domain = str(inp.get("search_domain_filter") or "").strip()
    if domain:
        payload["search_domain_filter"] = domain
    return payload


async def run_zhipu_web_search(
    connector: Connector,
    query: str,
    *,
    param_overrides: dict[str, Any] | None = None,
    include_debug: bool = False,
) -> dict[str, Any]:
    secrets = decrypt_secrets_blob(connector.secrets_encrypted)
    api_key = (secrets.get("ZHIPU_API_KEY") or "").strip()
    if not api_key:
        raise ValueError("ZHIPU_API_KEY is not configured for this connector")

    inp = _merged_inputs(connector, param_overrides)
    endpoint = _search_endpoint(connector)
    payload = _build_zhipu_payload(inp, query)

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            endpoint,
            json=payload,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
    if resp.status_code >= 400:
        detail = resp.text[:500]
        try:
            err_body = resp.json()
            if isinstance(err_body, dict):
                err_obj = err_body.get("error")
                if isinstance(err_obj, dict) and err_obj.get("message"):
                    detail = str(err_obj["message"])
        except Exception:
            pass
        raise ValueError(f"Zhipu web search failed ({resp.status_code}): {detail}")

    data = resp.json()
    if not isinstance(data, dict):
        raise ValueError("Zhipu web search returned an unexpected response shape")

    out = _normalize_zhipu_response(data, str(payload["search_query"]))
    if include_debug:
        out["debug"] = {
            "method": "POST",
            "endpoint": endpoint,
            "request_body": payload,
            "status_code": resp.status_code,
            "provider_response": data,
        }
    return out
