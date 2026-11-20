"""Web search runs through the connector the deployment configured.

The point of this endpoint is that the qa-agent holds no credential: the connector owns it, the backend calls the
provider, and "not configured" is a 404 rather than an empty result a model would read as "the web has nothing".
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.api.internal import search as module


def _connector(name: str = "zhipu-search") -> SimpleNamespace:
    return SimpleNamespace(id="c1", name=name, kind="zhipu_web_search", enabled=True)


def test_not_configured_is_a_404_not_an_empty_list():
    with patch.object(module, "web_search_connector", AsyncMock(return_value=None)):
        with pytest.raises(HTTPException) as raised:
            asyncio.run(module.web_search(module.WebSearchRequest(query="rates"), db=None))
    assert raised.value.status_code == 404


def test_results_are_normalised_to_title_url_content():
    provider = {
        "results": [
            {
                "title": "Rates",
                "link": "https://example.com/r",
                "content": "5.5%",
                "media": "Example",
                "publish_date": "2026-11-01",
            }
        ]
    }
    with patch.object(module, "web_search_connector", AsyncMock(return_value=_connector())):
        with patch.object(module, "run_zhipu_web_search", AsyncMock(return_value=provider)):
            out = asyncio.run(module.web_search(module.WebSearchRequest(query="rates", limit=3), db=None))
    assert out["connector"] == "zhipu-search"
    assert out["results"] == [
        {
            "title": "Rates",
            "url": "https://example.com/r",
            "content": "5.5%",
            "publisher": "Example",
            "published_at": "2026-11-01",
        }
    ]


def test_a_provider_failure_is_a_502_with_the_reason():
    with patch.object(module, "web_search_connector", AsyncMock(return_value=_connector())):
        with patch.object(
            module, "run_zhipu_web_search", AsyncMock(side_effect=ValueError("Zhipu web search failed (401)"))
        ):
            with pytest.raises(HTTPException) as raised:
                asyncio.run(module.web_search(module.WebSearchRequest(query="rates"), db=None))
    assert raised.value.status_code == 502
    assert "401" in str(raised.value.detail)


def test_the_limit_is_capped():
    payload = {"results": [{"title": str(i), "link": f"https://e/{i}", "content": "x"} for i in range(20)]}
    with patch.object(module, "web_search_connector", AsyncMock(return_value=_connector())):
        with patch.object(module, "run_zhipu_web_search", AsyncMock(return_value=payload)):
            out = asyncio.run(module.web_search(module.WebSearchRequest(query="q", limit=99), db=None))
    assert len(out["results"]) == module.MAX_RESULTS
