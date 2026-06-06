"""document-channels — list (json/tree), create, update."""
from __future__ import annotations

import argparse
import json

import pytest


def test_document_channels_list_json(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/document-channels")] = (200, [{"id": "dc1", "name": "Root", "children": []}])

    from openkms.commands.document_channels import cmd_list

    cmd_list(argparse.Namespace(tree=False))
    assert recorded[-1].url.path == "/api/document-channels"


def test_document_channels_list_tree(mock_api, capsys):
    _, responses = mock_api
    responses[("GET", "/api/document-channels")] = (
        200,
        [{"id": "a", "name": "A", "children": [{"id": "b", "name": "B", "children": []}]}],
    )

    from openkms.commands.document_channels import cmd_list

    cmd_list(argparse.Namespace(tree=True))
    out = capsys.readouterr().out
    assert "A" in out and "(a)" in out
    assert "B" in out and "(b)" in out


def test_document_channels_update_yes(mock_api):
    recorded, responses = mock_api
    responses[("PUT", "/api/document-channels/dc9")] = (200, {"id": "dc9", "name": "Renamed"})

    from openkms.commands.document_channels import cmd_update

    cmd_update(
        argparse.Namespace(
            id="dc9",
            name="Renamed",
            description=None,
            parent_id=None,
            sort_order=None,
            pipeline_id=None,
            extraction_model_id=None,
            extraction_schema_json=None,
            auto_process=None,
            yes=True,
            dry_run=False,
        )
    )
    req = recorded[-1]
    assert req.method == "PUT"
    assert req.url.path == "/api/document-channels/dc9"
    assert json.loads(req.content) == {"name": "Renamed"}


def test_document_channels_update_dry_run_no_http(mock_api):
    recorded, _ = mock_api
    from openkms.commands.document_channels import cmd_update

    with pytest.raises(SystemExit) as ei:
        cmd_update(
            argparse.Namespace(
                id="dc1",
                name="X",
                description=None,
                parent_id=None,
                sort_order=None,
                pipeline_id=None,
                extraction_model_id=None,
                extraction_schema_json=None,
                auto_process=None,
                yes=False,
                dry_run=True,
            )
        )
    assert ei.value.code == 0
    assert not recorded


def test_document_channels_create_with_pipeline_id(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/document-channels")] = (
        200,
        {"id": "dc_new", "name": "Insurance", "children": []},
    )
    responses[("PUT", "/api/document-channels/dc_new")] = (
        200,
        {"id": "dc_new", "name": "Insurance", "pipeline_id": "pipeline_baidu_doc_parse", "children": []},
    )

    from openkms.commands.document_channels import cmd_create

    cmd_create(
        argparse.Namespace(
            name="Insurance",
            description="",
            parent_id="",
            sort_order=0,
            pipeline_id="pipeline_baidu_doc_parse",
            yes=True,
            dry_run=False,
        )
    )
    assert recorded[0].method == "POST"
    assert recorded[1].method == "PUT"
    assert recorded[1].url.path == "/api/document-channels/dc_new"
    assert json.loads(recorded[1].content) == {"pipeline_id": "pipeline_baidu_doc_parse"}


def test_document_channels_create_dry_run_shows_pipeline_step(mock_api, capsys):
    recorded, _ = mock_api
    from openkms.commands.document_channels import cmd_create

    with pytest.raises(SystemExit) as ei:
        cmd_create(
            argparse.Namespace(
                name="Inbox",
                description="",
                parent_id="",
                sort_order=0,
                pipeline_id="pipeline_paddleocr",
                yes=False,
                dry_run=True,
            )
        )
    assert ei.value.code == 0
    assert not recorded
    out = capsys.readouterr().out
    assert "pipeline_paddleocr" in out
    assert "PUT" in out
