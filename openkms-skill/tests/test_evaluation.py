"""evaluation-datasets + evaluation-runs."""
from __future__ import annotations

import argparse
import json


def test_ds_items_pagination(mock_api):
    recorded, _ = mock_api

    from openkms.commands.evaluation import cmd_ds_items
    cmd_ds_items(argparse.Namespace(id="ds1", limit=10, offset=0))

    req = recorded[-1]
    assert req.url.path == "/api/evaluation-datasets/ds1/items"
    assert req.url.params["limit"] == "10"


def test_ds_run_with_type(mock_api):
    recorded, _ = mock_api

    from openkms.commands.evaluation import cmd_ds_run
    cmd_ds_run(argparse.Namespace(id="ds1", type="qa_answer"))

    req = recorded[-1]
    assert req.method == "POST"
    assert req.url.path == "/api/evaluation-datasets/ds1/run"
    assert json.loads(req.content) == {"evaluation_type": "qa_answer"}


def test_ds_run_default_type(mock_api):
    recorded, _ = mock_api

    from openkms.commands.evaluation import cmd_ds_run
    cmd_ds_run(argparse.Namespace(id="ds1", type=""))

    req = recorded[-1]
    # When --type omitted, body is omitted (server defaults to running both).
    assert req.content in (b"", b"null")


def test_runs_compare(mock_api):
    recorded, _ = mock_api

    from openkms.commands.evaluation import cmd_runs_compare
    cmd_runs_compare(argparse.Namespace(dataset_id="ds1", run_a="ra", run_b="rb"))

    req = recorded[-1]
    assert req.url.path == "/api/evaluation-datasets/ds1/runs/compare"
    assert req.url.params["run_a"] == "ra"
    assert req.url.params["run_b"] == "rb"
