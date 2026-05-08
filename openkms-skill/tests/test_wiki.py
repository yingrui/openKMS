"""wiki — list-pages, get-page, put-page (path encoding)."""
from __future__ import annotations

import argparse
import json


def test_wiki_get_page_path_encoding(mock_api):
    recorded, responses = mock_api
    # path "guides/onboarding" → quote(safe="") → "guides%2Fonboarding"
    responses[("GET", "/api/wiki-spaces/sp1/pages/by-path/guides%2Fonboarding")] = (
        200,
        {"id": "p1", "title": "T"},
    )

    from openkms.commands.wiki import cmd_get_page
    cmd_get_page(argparse.Namespace(space_id="sp1", path="/guides/onboarding"))

    assert str(recorded[-1].url).endswith(
        "/api/wiki-spaces/sp1/pages/by-path/guides%2Fonboarding"
    )


def test_wiki_list_pages(mock_api):
    recorded, _ = mock_api

    from openkms.commands.wiki import cmd_list_pages
    cmd_list_pages(argparse.Namespace(space_id="sp1", limit=10, offset=20))

    req = recorded[-1]
    assert req.url.path == "/api/wiki-spaces/sp1/pages"
    assert req.url.params["limit"] == "10"
    assert req.url.params["offset"] == "20"


def test_wiki_put_page_body(mock_api, tmp_path):
    recorded, _ = mock_api
    f = tmp_path / "note.md"
    f.write_text("hello world", encoding="utf-8")

    from openkms.commands.wiki import cmd_put_page
    cmd_put_page(argparse.Namespace(
        space_id="sp1", path="my/page", title="T", file=str(f),
    ))

    req = recorded[-1]
    assert req.method == "PUT"
    assert str(req.url).endswith("/api/wiki-spaces/sp1/pages/by-path/my%2Fpage")
    body = json.loads(req.content)
    assert body == {"title": "T", "body": "hello world", "metadata": None}
