"""pipelines — list."""
from __future__ import annotations

import argparse

import pytest


def test_pipelines_list_json(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/pipelines")] = (
        200,
        {
            "items": [
                {
                    "id": "pipeline_paddleocr",
                    "name": "PaddleOCR Document Parse",
                    "is_active": True,
                }
            ],
            "total": 1,
        },
    )

    from openkms.commands.pipelines import cmd_list

    cmd_list(argparse.Namespace(table=False))
    assert recorded[-1].url.path == "/api/pipelines"


def test_pipelines_list_table(mock_api, capsys):
    _, responses = mock_api
    responses[("GET", "/api/pipelines")] = (
        200,
        {
            "items": [
                {"id": "pipeline_baidu_doc_parse", "name": "Baidu Cloud Document Parse", "is_active": True},
            ],
            "total": 1,
        },
    )

    from openkms.commands.pipelines import cmd_list

    cmd_list(argparse.Namespace(table=True))
    out = capsys.readouterr().out
    assert "pipeline_baidu_doc_parse" in out
    assert "Baidu Cloud Document Parse" in out
    assert "active" in out
