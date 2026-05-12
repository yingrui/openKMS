"""wiki files — list / delete."""
from __future__ import annotations

import argparse

import pytest


def test_wiki_files_list(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/wiki-spaces/sp1/files")] = (
        200,
        {"items": [{"id": "f1", "filename": "a.png"}], "total": 1},
    )

    from openkms.commands.wiki import cmd_files_list

    cmd_files_list(argparse.Namespace(space_id="sp1"))
    assert recorded[-1].url.path == "/api/wiki-spaces/sp1/files"


def test_wiki_files_delete_yes(mock_api):
    recorded, responses = mock_api
    responses[("DELETE", "/api/wiki-spaces/sp1/files/f9")] = (204, b"")

    from openkms.commands.wiki import cmd_files_delete

    cmd_files_delete(
        argparse.Namespace(space_id="sp1", file_id="f9", yes=True, dry_run=False)
    )
    assert recorded[-1].method == "DELETE"
    assert recorded[-1].url.path == "/api/wiki-spaces/sp1/files/f9"


def test_wiki_files_delete_dry_run(mock_api):
    recorded, _ = mock_api
    from openkms.commands.wiki import cmd_files_delete

    with pytest.raises(SystemExit) as ei:
        cmd_files_delete(
            argparse.Namespace(
                space_id="sp1", file_id="f1", yes=False, dry_run=True
            )
        )
    assert ei.value.code == 0
    assert not recorded
