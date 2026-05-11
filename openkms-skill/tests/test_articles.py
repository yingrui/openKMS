"""articles — list/get/markdown/create."""
from __future__ import annotations

import argparse
import json


def test_articles_list(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/articles")] = (200, {"items": [], "total": 0})

    from openkms.commands.articles import cmd_list
    cmd_list(argparse.Namespace(channel_id="c1", search="", limit=5, offset=0))

    p = recorded[-1].url.params
    assert p["channel_id"] == "c1"
    assert p["limit"] == "5"
    assert "search" not in p


def test_articles_list_uses_default_channel_from_config(monkeypatch, mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/articles")] = (200, {"items": [], "total": 0})

    def fake_cfg():
        return {
            "api_base_url": "http://t",
            "api_key": "k",
            "raw": {},
            "default_document_channel_id": None,
            "default_article_channel_id": "art-ch",
        }

    import openkms.commands.articles as amod

    monkeypatch.setattr(amod, "load_config", fake_cfg)
    from openkms.commands.articles import cmd_list

    cmd_list(argparse.Namespace(channel_id="", search="", limit=5, offset=0))
    assert recorded[-1].url.params["channel_id"] == "art-ch"


def test_articles_create_with_inline_markdown(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/articles")] = (200, {"id": "a1"})

    from openkms.commands.articles import cmd_create
    cmd_create(argparse.Namespace(
        channel_id="c1", name="Title", markdown="# md", markdown_file="", origin_url="",
        yes=True, dry_run=False,
    ))

    body = json.loads(recorded[-1].content)
    assert body == {"channel_id": "c1", "name": "Title", "markdown": "# md"}


def test_articles_markdown(mock_api, capsys):
    _, responses = mock_api
    responses[("GET", "/api/articles/a9")] = (200, {"id": "a9", "markdown": "## hi"})

    from openkms.commands.articles import cmd_markdown
    cmd_markdown(argparse.Namespace(id="a9", out=""))

    assert "## hi" in capsys.readouterr().out
