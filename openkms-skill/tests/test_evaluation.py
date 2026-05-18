"""evaluations + evaluation-runs."""
from __future__ import annotations

import argparse
import json


def test_ds_create_posts_body(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/evaluations")] = (200, {"id": "ds-new"})

    from openkms.commands.evaluation import cmd_ds_create

    cmd_ds_create(
        argparse.Namespace(
            name="Smoke DS",
            kb_id="kb1",
            wiki_space_id="",
            description="d",
            yes=True,
            dry_run=False,
        )
    )
    req = recorded[-1]
    assert req.method == "POST"
    assert json.loads(req.content) == {
        "name": "Smoke DS",
        "knowledge_base_id": "kb1",
        "description": "d",
    }


def test_ds_items_pagination(mock_api):
    recorded, _ = mock_api

    from openkms.commands.evaluation import cmd_ds_items
    cmd_ds_items(argparse.Namespace(id="ds1", limit=10, offset=0))

    req = recorded[-1]
    assert req.url.path == "/api/evaluations/ds1/items"
    assert req.url.params["limit"] == "10"


def test_ds_run_with_type(mock_api):
    recorded, _ = mock_api

    from openkms.commands.evaluation import cmd_ds_run
    cmd_ds_run(argparse.Namespace(id="ds1", type="qa_answer", yes=True, dry_run=False))

    req = recorded[-1]
    assert req.method == "POST"
    assert req.url.path == "/api/evaluations/ds1/run"
    assert json.loads(req.content) == {"evaluation_type": "qa_answer"}


def test_ds_run_default_type(mock_api):
    recorded, _ = mock_api

    from openkms.commands.evaluation import cmd_ds_run
    cmd_ds_run(argparse.Namespace(id="ds1", type="", yes=True, dry_run=False))

    req = recorded[-1]
    assert req.content in (b"", b"null")


def test_ds_run_wiki_content_coverage(mock_api):
    recorded, _ = mock_api

    from openkms.commands.evaluation import cmd_ds_run

    cmd_ds_run(
        argparse.Namespace(
            id="ds1", type="wiki_content_coverage", yes=True, dry_run=False
        )
    )
    assert json.loads(recorded[-1].content) == {
        "evaluation_type": "wiki_content_coverage",
    }


def test_runs_compare(mock_api):
    recorded, _ = mock_api

    from openkms.commands.evaluation import cmd_runs_compare
    cmd_runs_compare(argparse.Namespace(evaluation_id="ds1", run_a="ra", run_b="rb"))

    req = recorded[-1]
    assert req.url.path == "/api/evaluations/ds1/runs/compare"
    assert req.url.params["run_a"] == "ra"
    assert req.url.params["run_b"] == "rb"


def test_ds_create_with_wiki_space_id(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/evaluations")] = (200, {"id": "ev-w"})

    from openkms.commands.evaluation import cmd_ds_create

    cmd_ds_create(
        argparse.Namespace(
            name="W",
            kb_id="kb1",
            wiki_space_id="ws9",
            description="",
            yes=True,
            dry_run=False,
        )
    )
    assert json.loads(recorded[-1].content) == {
        "name": "W",
        "knowledge_base_id": "kb1",
        "wiki_space_id": "ws9",
    }
