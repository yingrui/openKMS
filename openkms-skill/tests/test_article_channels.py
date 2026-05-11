"""article-channels — list (json/tree), create, update."""
from __future__ import annotations

import argparse
import json

import pytest


def test_article_channels_list_json(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/article-channels")] = (200, [{"id": "ac1", "name": "News", "children": []}])

    from openkms.commands.article_channels import cmd_list

    cmd_list(argparse.Namespace(tree=False))
    assert recorded[-1].url.path == "/api/article-channels"


def test_article_channels_update_yes(mock_api):
    recorded, responses = mock_api
    responses[("PUT", "/api/article-channels/ac9")] = (200, {"id": "ac9", "name": "T"})

    from openkms.commands.article_channels import cmd_update

    cmd_update(
        argparse.Namespace(
            id="ac9",
            name="T",
            description=None,
            parent_id=None,
            sort_order=3,
            yes=True,
            dry_run=False,
        )
    )
    req = recorded[-1]
    assert req.method == "PUT"
    assert json.loads(req.content) == {"name": "T", "sort_order": 3}


def test_article_channels_update_dry_run(mock_api):
    recorded, _ = mock_api
    from openkms.commands.article_channels import cmd_update

    with pytest.raises(SystemExit) as ei:
        cmd_update(
            argparse.Namespace(
                id="ac1",
                name="only-dry",
                description=None,
                parent_id=None,
                sort_order=None,
                yes=False,
                dry_run=True,
            )
        )
    assert ei.value.code == 0
    assert not recorded
