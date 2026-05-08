"""search command — params and auth header."""
from __future__ import annotations

import argparse


def _ns(**kw):
    defaults = dict(
        q="",
        types="",
        document_channel_id="",
        article_channel_id="",
        updated_after="",
        updated_before="",
        limit=0,
    )
    defaults.update(kw)
    return argparse.Namespace(**defaults)


def test_search_minimal(mock_api, capsys):
    recorded, responses = mock_api
    responses[("GET", "/api/search")] = (200, {"sections": [], "total": 0})

    from openkms.commands.search import cmd_search
    cmd_search(_ns(q="乳腺癌"))

    req = recorded[-1]
    assert req.method == "GET"
    assert req.url.path == "/api/search"
    assert req.url.params["q"] == "乳腺癌"
    assert "types" not in req.url.params
    assert req.headers["Authorization"] == "Bearer okms.test.secret"
    assert "sections" in capsys.readouterr().out


def test_search_full_params(mock_api):
    recorded, _ = mock_api

    from openkms.commands.search import cmd_search
    cmd_search(_ns(
        q="hello",
        types="documents,articles",
        document_channel_id="dc1",
        article_channel_id="ac1",
        updated_after="2026-01-01T00:00:00Z",
        updated_before="2026-12-31T00:00:00Z",
        limit=50,
    ))

    p = recorded[-1].url.params
    assert p["types"] == "documents,articles"
    assert p["document_channel_id"] == "dc1"
    assert p["article_channel_id"] == "ac1"
    assert p["updated_after"] == "2026-01-01T00:00:00Z"
    assert p["updated_before"] == "2026-12-31T00:00:00Z"
    assert p["limit"] == "50"
