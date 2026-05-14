"""documents — list/get/markdown/upload/relationships/lifecycle."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pytest


def test_documents_list_with_filters(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/documents")] = (200, {"items": [], "total": 0})

    from openkms.commands.documents import cmd_list
    cmd_list(argparse.Namespace(channel_id="ch1", search="cancer", limit=20, offset=10))

    req = recorded[-1]
    assert req.method == "GET"
    assert req.url.path == "/api/documents"
    assert req.url.params["channel_id"] == "ch1"
    assert req.url.params["search"] == "cancer"
    assert req.url.params["limit"] == "20"
    assert req.url.params["offset"] == "10"


def test_documents_list_uses_default_channel_from_config(monkeypatch, mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/documents")] = (200, {"items": [], "total": 0})

    def fake_cfg():
        return {
            "api_base_url": "http://t",
            "api_key": "k",
            "raw": {},
            "default_document_channel_id": "ch-def",
            "default_article_channel_id": None,
        }

    import openkms.commands.documents as dmod

    monkeypatch.setattr(dmod, "load_config", fake_cfg)
    from openkms.commands.documents import cmd_list

    cmd_list(argparse.Namespace(channel_id="", search="", limit=10, offset=0))
    assert recorded[-1].url.params["channel_id"] == "ch-def"


def test_documents_upload_dry_run_no_request(mock_api, tmp_path, monkeypatch):
    f = tmp_path / "x.pdf"
    f.write_bytes(b"%PDF-1.4")
    recorded, _ = mock_api

    import openkms.commands.documents as dmod

    monkeypatch.setattr(
        dmod,
        "load_config",
        lambda: {
            "api_base_url": "http://t",
            "api_key": "k",
            "raw": {},
            "default_document_channel_id": "ch1",
            "default_article_channel_id": None,
        },
    )
    from openkms.commands.documents import cmd_upload

    with pytest.raises(SystemExit) as ei:
        cmd_upload(
            argparse.Namespace(
                channel_id="",
                file=str(f),
                yes=False,
                dry_run=True,
            )
        )
    assert ei.value.code == 0
    assert not recorded


def test_documents_get(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/documents/doc-42")] = (200, {"id": "doc-42", "name": "x"})

    from openkms.commands.documents import cmd_get
    cmd_get(argparse.Namespace(id="doc-42"))

    assert recorded[-1].url.path == "/api/documents/doc-42"


def test_documents_markdown_to_stdout(mock_api, capsys):
    _, responses = mock_api
    responses[("GET", "/api/documents/d1")] = (200, {"id": "d1", "markdown": "# Hello"})

    from openkms.commands.documents import cmd_markdown
    cmd_markdown(argparse.Namespace(id="d1", out=""))

    assert "# Hello" in capsys.readouterr().out


def test_documents_markdown_to_file(mock_api, tmp_path):
    _, responses = mock_api
    responses[("GET", "/api/documents/d2")] = (200, {"id": "d2", "markdown": "body"})

    out = tmp_path / "out.md"
    from openkms.commands.documents import cmd_markdown
    cmd_markdown(argparse.Namespace(id="d2", out=str(out)))

    assert out.read_text(encoding="utf-8") == "body"


def test_documents_upload_multipart(mock_api, tmp_path):
    recorded, responses = mock_api
    responses[("POST", "/api/documents/upload")] = (200, {"id": "new-doc"})

    f = tmp_path / "case.md"
    f.write_text("hi", encoding="utf-8")

    from openkms.commands.documents import cmd_upload
    cmd_upload(argparse.Namespace(channel_id="ch9", file=str(f), yes=True, dry_run=False))

    req = recorded[-1]
    assert req.method == "POST"
    assert req.url.path == "/api/documents/upload"
    body = req.content
    assert b"channel_id" in body
    assert b"ch9" in body
    assert b"case.md" in body


def test_documents_relationships_list(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/documents/d1/relationships")] = (
        200,
        {"outgoing": [], "incoming": []},
    )
    from openkms.commands.documents import cmd_relationships_list

    cmd_relationships_list(argparse.Namespace(id="d1"))
    assert recorded[-1].url.path == "/api/documents/d1/relationships"


def test_documents_relationships_create_yes(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/documents/d1/relationships")] = (
        201,
        {
            "id": "rel1",
            "relation_type": "supersedes",
            "peer_document_id": "d2",
            "peer_document_name": "b",
            "note": None,
            "created_at": "2026-01-01T00:00:00Z",
        },
    )
    from openkms.commands.documents import cmd_relationships_create

    cmd_relationships_create(
        argparse.Namespace(
            id="d1",
            target_id="d2",
            relation_type="supersedes",
            note="",
            yes=True,
            dry_run=False,
        )
    )
    assert json.loads(recorded[-1].content) == {
        "target_document_id": "d2",
        "relation_type": "supersedes",
    }


def test_documents_lifecycle_patch_dry_run(mock_api):
    recorded, _ = mock_api
    from openkms.commands.documents import cmd_lifecycle_patch

    with pytest.raises(SystemExit) as ei:
        cmd_lifecycle_patch(
            argparse.Namespace(
                id="d1",
                series_id=None,
                effective_from=None,
                effective_to=None,
                lifecycle_status="withdrawn",
                clear_effective_from=False,
                clear_effective_to=False,
                yes=False,
                dry_run=True,
            )
        )
    assert ei.value.code == 0
    assert not recorded
