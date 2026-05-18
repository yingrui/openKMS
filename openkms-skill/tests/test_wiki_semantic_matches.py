"""wiki pages semantic-matches."""
from __future__ import annotations

import argparse


def test_wiki_pages_semantic_matches(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/wiki-spaces/sp1/pages/semantic-matches")] = (
        200,
        {
            "string_matched_page_ids": ["p1"],
            "semantic_matched_pages": [],
            "semantic_skipped": False,
        },
    )

    from openkms.commands.wiki import cmd_pages_semantic_matches

    cmd_pages_semantic_matches(
        argparse.Namespace(
            space_id="sp1",
            q="hello",
            top_k=0,
            text_match_limit=0,
        )
    )
    req = recorded[-1]
    assert req.method == "GET"
    assert req.url.path == "/api/wiki-spaces/sp1/pages/semantic-matches"
    assert req.url.params["q"] == "hello"


def test_wiki_pages_semantic_matches_top_k(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/wiki-spaces/sp1/pages/semantic-matches")] = (200, {})

    from openkms.commands.wiki import cmd_pages_semantic_matches

    cmd_pages_semantic_matches(
        argparse.Namespace(space_id="sp1", q="x", top_k=5, text_match_limit=100)
    )
    p = recorded[-1].url.params
    assert p["q"] == "x"
    assert p["top_k"] == "5"
    assert p["text_match_limit"] == "100"
