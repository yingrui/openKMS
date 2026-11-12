"""article-channels — list (json/tree), create, update, delete."""
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


def test_article_channels_list_tree_accepts_items_envelope(mock_api, capsys):
    """The list endpoint answers {"items": [...]}; --tree used to iterate the dict keys."""
    _, responses = mock_api
    responses[("GET", "/api/article-channels")] = (200, {"items": [{"id": "ac1", "name": "Root", "children": []}]})

    from openkms.commands.article_channels import cmd_list

    cmd_list(argparse.Namespace(tree=True))
    out = capsys.readouterr().out
    assert "Root" in out and "(ac1)" in out


def test_article_channels_list_tree(mock_api, capsys):
    _, responses = mock_api
    responses[("GET", "/api/article-channels")] = (
        200,
        [{"id": "a", "name": "A", "children": [{"id": "b", "name": "B", "children": []}]}],
    )

    from openkms.commands.article_channels import cmd_list

    cmd_list(argparse.Namespace(tree=True))
    out = capsys.readouterr().out
    assert "A" in out and "(a)" in out
    assert "B" in out and "(b)" in out


def test_article_channels_create(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/article-channels")] = (201, {"id": "ac2", "name": "New"})

    from openkms.commands.article_channels import cmd_create

    cmd_create(argparse.Namespace(name="New", sort_order=0, description=None, parent_id=None, yes=True, dry_run=False))
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


def test_article_channels_delete(mock_api):
    recorded, responses = mock_api
    responses[("DELETE", "/api/article-channels/ac1")] = (204, None)

    from openkms.commands.article_channels import cmd_delete

    cmd_delete(argparse.Namespace(id="ac1", yes=True, dry_run=False))
    assert recorded[-1].method == "DELETE"
    assert recorded[-1].url.path == "/api/article-channels/ac1"
