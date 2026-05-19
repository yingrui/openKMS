"""evaluations + evaluation-runs."""
from __future__ import annotations

import argparse
import json

import pytest


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

    from openkms.commands.evaluation import cmd_ds_items_list

    cmd_ds_items_list(argparse.Namespace(id="ds1", limit=10, offset=0))

    req = recorded[-1]
    assert req.url.path == "/api/evaluations/ds1/items"
    assert req.url.params["limit"] == "10"


def test_ds_update_puts_body(mock_api):
    recorded, responses = mock_api
    responses[("PUT", "/api/evaluations/ds1")] = (200, {"id": "ds1", "name": "N"})

    from openkms.commands.evaluation import cmd_ds_update

    cmd_ds_update(
        argparse.Namespace(
            id="ds1",
            name="N",
            description=None,
            wiki_space_id=None,
            clear_wiki_space=False,
            yes=True,
            dry_run=False,
        )
    )
    req = recorded[-1]
    assert req.method == "PUT"
    assert json.loads(req.content) == {"name": "N"}


def test_ds_update_clear_wiki(mock_api):
    recorded, responses = mock_api
    responses[("PUT", "/api/evaluations/ds1")] = (200, {"id": "ds1"})

    from openkms.commands.evaluation import cmd_ds_update

    cmd_ds_update(
        argparse.Namespace(
            id="ds1",
            name=None,
            description=None,
            wiki_space_id=None,
            clear_wiki_space=True,
            yes=True,
            dry_run=False,
        )
    )
    assert json.loads(recorded[-1].content) == {"wiki_space_id": None}


def test_ds_update_requires_at_least_one_field(mock_api):
    from openkms.commands.evaluation import cmd_ds_update

    with pytest.raises(SystemExit) as ei:
        cmd_ds_update(
            argparse.Namespace(
                id="ds1",
                name=None,
                description=None,
                wiki_space_id=None,
                clear_wiki_space=False,
                yes=True,
                dry_run=False,
            )
        )
    assert ei.value.code == 2


def test_ds_item_add(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/evaluations/ds1/items")] = (201, {"id": "it1"})

    from openkms.commands.evaluation import cmd_ds_item_add

    cmd_ds_item_add(
        argparse.Namespace(
            id="ds1",
            query="Q",
            expected_answer="A",
            topic=None,
            sort_order=3,
            yes=True,
            dry_run=False,
        )
    )
    assert json.loads(recorded[-1].content) == {
        "query": "Q",
        "expected_answer": "A",
        "sort_order": 3,
    }


def test_ds_item_update(mock_api):
    recorded, responses = mock_api
    responses[("PUT", "/api/evaluations/ds1/items/it1")] = (200, {"id": "it1"})

    from openkms.commands.evaluation import cmd_ds_item_update

    cmd_ds_item_update(
        argparse.Namespace(
            id="ds1",
            item_id="it1",
            query="Q2",
            expected_answer=None,
            topic=None,
            sort_order=None,
            yes=True,
            dry_run=False,
        )
    )
    assert recorded[-1].url.path == "/api/evaluations/ds1/items/it1"
    assert json.loads(recorded[-1].content) == {"query": "Q2"}


def test_ds_item_update_requires_field(mock_api):
    from openkms.commands.evaluation import cmd_ds_item_update

    with pytest.raises(SystemExit) as ei:
        cmd_ds_item_update(
            argparse.Namespace(
                id="ds1",
                item_id="it1",
                query=None,
                expected_answer=None,
                topic=None,
                sort_order=None,
                yes=True,
                dry_run=False,
            )
        )
    assert ei.value.code == 2


def test_ds_item_delete(mock_api):
    recorded, responses = mock_api
    responses[("DELETE", "/api/evaluations/ds1/items/it1")] = (204, b"")

    from openkms.commands.evaluation import cmd_ds_item_delete

    cmd_ds_item_delete(
        argparse.Namespace(id="ds1", item_id="it1", yes=True, dry_run=False)
    )
    assert recorded[-1].method == "DELETE"


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
