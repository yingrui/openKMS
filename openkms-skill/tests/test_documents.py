"""documents — list/get/markdown/upload."""
from __future__ import annotations

import argparse
from pathlib import Path


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
    cmd_upload(argparse.Namespace(channel_id="ch9", file=str(f)))

    req = recorded[-1]
    assert req.method == "POST"
    assert req.url.path == "/api/documents/upload"
    body = req.content
    assert b"channel_id" in body
    assert b"ch9" in body
    assert b"case.md" in body
