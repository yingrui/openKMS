"""knowledge-map — tree, resource-links put, nodes delete dry-run."""
from __future__ import annotations

import argparse
import json

import pytest


def test_nodes_tree(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/knowledge-map/nodes/tree")] = (200, [])

    from openkms.commands.knowledge_map import cmd_nodes_tree

    cmd_nodes_tree(argparse.Namespace())
    assert recorded[-1].url.path == "/api/knowledge-map/nodes/tree"


def test_resource_links_put_yes(mock_api):
    recorded, responses = mock_api
    responses[("PUT", "/api/knowledge-map/resource-links")] = (
        200,
        {
            "id": "lnk1",
            "knowledge_map_node_id": "n1",
            "resource_type": "wiki_space",
            "resource_id": "ws1",
        },
    )

    from openkms.commands.knowledge_map import cmd_resource_links_put

    cmd_resource_links_put(
        argparse.Namespace(
            knowledge_map_node_id="n1",
            resource_type="wiki_space",
            resource_id="ws1",
            yes=True,
            dry_run=False,
        )
    )
    assert json.loads(recorded[-1].content) == {
        "knowledge_map_node_id": "n1",
        "resource_type": "wiki_space",
        "resource_id": "ws1",
    }


def test_nodes_delete_dry_run(mock_api):
    recorded, _ = mock_api
    from openkms.commands.knowledge_map import cmd_nodes_delete

    with pytest.raises(SystemExit) as ei:
        cmd_nodes_delete(
            argparse.Namespace(id="n9", yes=False, dry_run=True),
        )
    assert ei.value.code == 0
    assert not recorded
