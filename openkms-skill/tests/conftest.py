"""Smoke-test fixtures: mock httpx transport so commands hit no network."""
from __future__ import annotations

import importlib
import sys
from pathlib import Path
from typing import Any

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))


_PATCHED_MODULES = (
    "openkms.commands.ping",
    "openkms.commands.search",
    "openkms.commands.document_channels",
    "openkms.commands.article_channels",
    "openkms.commands.documents",
    "openkms.commands.articles",
    "openkms.commands.wiki_spaces",
    "openkms.commands.wiki",
    "openkms.commands.kb",
    "openkms.commands.kb_faq",
    "openkms.commands.glossaries",
    "openkms.commands.knowledge_map",
    "openkms.commands.ontology",
    "openkms.commands.objects",
    "openkms.commands.links",
    "openkms.commands.evaluation",
)


@pytest.fixture
def mock_api(monkeypatch):
    """Yields (recorded_requests_list, response_map_dict).

    Tests pre-program responses by `(METHOD, path)` (query string ignored). Any unmatched
    request falls through to a 200 with an empty JSON object.
    """
    recorded: list[httpx.Request] = []
    response_map: dict[tuple[str, str], tuple[int, Any]] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        recorded.append(request)
        key = (request.method, request.url.path)
        if key in response_map:
            status, payload = response_map[key]
        else:
            status, payload = 200, {}
        if isinstance(payload, (dict, list)):
            return httpx.Response(status, json=payload)
        return httpx.Response(status, content=payload)

    transport = httpx.MockTransport(handler)

    def fake_client() -> httpx.Client:
        return httpx.Client(
            base_url="http://test.local",
            headers={"Authorization": "Bearer okms.test.secret"},
            timeout=10.0,
            transport=transport,
        )

    import openkms.client as oc
    monkeypatch.setattr(oc, "client", fake_client)
    for mod_name in _PATCHED_MODULES:
        m = importlib.import_module(mod_name)
        monkeypatch.setattr(m, "client", fake_client)

    yield recorded, response_map
