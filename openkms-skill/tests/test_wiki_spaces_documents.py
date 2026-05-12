"""wiki-spaces linked documents — list / link / unlink."""
from __future__ import annotations

import argparse
import json

import pytest


def test_documents_list(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/wiki-spaces/sp1/documents")] = (
        200,
        {"items": [{"id": "lnk1", "document_id": "d1", "name": "a.pdf"}], "total": 1},
    )

    from openkms.commands.wiki_spaces import cmd_documents_list

    cmd_documents_list(argparse.Namespace(space_id="sp1"))
    assert recorded[-1].url.path == "/api/wiki-spaces/sp1/documents"


def test_documents_link_yes(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/wiki-spaces/sp1/documents")] = (
        201,
        {"id": "lnk", "document_id": "d9", "name": "x"},
    )

    from openkms.commands.wiki_spaces import cmd_documents_link

    cmd_documents_link(
        argparse.Namespace(space_id="sp1", document_id="d9", yes=True, dry_run=False)
    )
    req = recorded[-1]
    assert req.method == "POST"
    assert json.loads(req.content) == {"document_id": "d9"}


def test_documents_unlink_dry_run(mock_api):
    recorded, _ = mock_api
    from openkms.commands.wiki_spaces import cmd_documents_unlink

    with pytest.raises(SystemExit) as ei:
        cmd_documents_unlink(
            argparse.Namespace(
                space_id="sp1", document_id="d1", yes=False, dry_run=True
            )
        )
    assert ei.value.code == 0
    assert not recorded
