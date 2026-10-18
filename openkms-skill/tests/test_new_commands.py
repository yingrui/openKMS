"""data-sources / datasets / connectors / jobs smoke tests."""
from __future__ import annotations

import argparse
import json

import pytest


def _ns(**kw):
    defaults = dict(yes=True, dry_run=False)
    defaults.update(kw)
    return argparse.Namespace(**defaults)


def test_data_sources_list(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/data-sources")] = (200, {"items": [], "total": 0})
    from openkms.commands.data_sources import cmd_list

    cmd_list(_ns(limit=None, offset=None))
    assert recorded[-1].url.path == "/api/data-sources"


def test_datasets_rows(mock_api):
    recorded, _ = mock_api
    from openkms.commands.datasets import cmd_rows

    cmd_rows(_ns(id="d1", filter=None, limit=10, offset=0, sort=None, order=None, after=None))
    assert recorded[-1].method == "POST"
    assert recorded[-1].url.path == "/api/datasets/d1/rows/query"


def test_datasets_rows_sends_filters(mock_api):
    recorded, _ = mock_api
    from openkms.commands.datasets import cmd_rows

    cmd_rows(
        _ns(
            id="d1",
            filter=["close > 100", "trade_date between 2026-01-01..2026-01-31", "industry in 银行,证券", "note is_null"],
            limit=None,
            offset=None,
            sort="trade_date",
            order="desc",
            after=None,
        )
    )
    body = json.loads(recorded[-1].content)
    assert body["filters"] == [
        {"field": "close", "op": ">", "value": "100"},
        {"field": "trade_date", "op": "between", "value": ["2026-01-01", "2026-01-31"]},
        {"field": "industry", "op": "in", "value": ["银行", "证券"]},
        {"field": "note", "op": "is_null"},
    ]
    assert body["sort"] == "trade_date" and body["order"] == "desc"
    assert body["limit"] == 100 and body["offset"] == 0


def test_datasets_rows_rejects_a_malformed_filter():
    import pytest

    from openkms.commands.datasets import cmd_rows

    with pytest.raises(SystemExit, match="column op value"):
        cmd_rows(_ns(id="d1", filter=["close"], limit=None, offset=None, sort=None, order=None, after=None))
    with pytest.raises(SystemExit, match="needs"):
        cmd_rows(_ns(id="d1", filter=["close >"], limit=None, offset=None, sort=None, order=None, after=None))
    with pytest.raises(SystemExit, match="a..b"):
        cmd_rows(
            _ns(id="d1", filter=["d between 2026"], limit=None, offset=None, sort=None, order=None, after=None)
        )


def test_datasets_list_search_and_paging(mock_api):
    recorded, _ = mock_api
    from openkms.commands.datasets import cmd_list

    cmd_list(_ns(data_source_id="ds1", search="stock", limit=50, offset=100))
    assert dict(recorded[-1].url.params) == {
        "data_source_id": "ds1",
        "search": "stock",
        "limit": "50",
        "offset": "100",
    }


def test_datasets_discover(mock_api):
    recorded, _ = mock_api
    from openkms.commands.datasets import cmd_discover

    cmd_discover(_ns(data_source_id="ds1"))
    assert recorded[-1].url.path == "/api/datasets/from-source/ds1"


def test_datasets_delete(mock_api):
    recorded, _ = mock_api
    from openkms.commands.datasets import cmd_delete

    cmd_delete(_ns(id="d1"))
    assert recorded[-1].method == "DELETE"
    assert recorded[-1].url.path == "/api/datasets/d1"


def test_datasets_update_sends_the_catalog_fields(mock_api):
    recorded, _ = mock_api
    from openkms.commands.datasets import cmd_update

    cmd_update(
        _ns(
            id="d1",
            display_name=None,
            description=None,
            domain="market",
            tags="stock, daily",
            business_definition="Daily quotes",
            sensitivity="internal",
            primary_key=None,
            unique_keys=None,
            ai_instructions=None,
            ai_synonyms=None,
            ai_examples=None,
            editable=None,
        )
    )
    assert json.loads(recorded[-1].content) == {
        "domain": "market",
        "tags": ["stock", "daily"],
        "business_definition": "Daily quotes",
        "sensitivity": "internal",
    }


def test_quality_update(mock_api):
    recorded, _ = mock_api
    from openkms.commands.datasets import cmd_quality_update

    cmd_quality_update(
        _ns(id="d1", rule_id="r1", name=None, column=None, severity=None, enabled="false", config='{"min": 0}')
    )
    assert recorded[-1].method == "PUT"
    assert recorded[-1].url.path == "/api/datasets/d1/quality-rules/r1"
    assert json.loads(recorded[-1].content) == {"enabled": False, "config": {"min": 0}}


def test_dataset_group_has_no_stale_field_commands():
    """Fields are model-scoped: a dataset-scoped copy would 404."""
    import argparse

    from openkms.commands import datasets as datasets_module

    parser = argparse.ArgumentParser(prog="cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    datasets_module.add_subparser(sub)
    assert "fields" not in parser.format_help()
    assert not hasattr(datasets_module, "cmd_fields_add")


def test_connectors_sync_yes(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/connectors/c1/sync")] = (202, {"job_id": 42})
    from openkms.commands.connectors import cmd_sync

    cmd_sync(_ns(id="c1", start_date=None, end_date=None))
    assert recorded[-1].url.path == "/api/connectors/c1/sync"
    assert json.loads(recorded[-1].content) == {}


def test_connectors_sync_requires_both_dates(mock_api, capsys):
    from openkms.commands.connectors import cmd_sync

    with pytest.raises(SystemExit) as exc:
        cmd_sync(_ns(id="c1", start_date="2024-01-01", end_date=None))
    assert exc.value.code == 2


def test_jobs_get(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/jobs/9")] = (200, {"id": 9, "status": "completed"})
    from openkms.commands.jobs import cmd_get

    cmd_get(_ns(id=9))
    assert recorded[-1].url.path == "/api/jobs/9"


def test_functions_execute_by_api_name(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/ontology/functions/by-api-name/helloGreeting/execute")] = (
        200,
        {"status": "ok", "output": {}},
    )
    from openkms.commands.functions import cmd_execute_by_api_name

    cmd_execute_by_api_name(_ns(api_name="helloGreeting", input_json='{"name":"x"}'))
    body = json.loads(recorded[-1].content)
    assert body["use_published"] is True
    assert body["input"] == {"name": "x"}


def test_action_types_create(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/ontology/action-types")] = (201, {"id": "at1"})
    from openkms.commands.action_types import cmd_create

    cmd_create(
        _ns(
            api_name="createWorkItem",
            display_name="Create Work Item",
            object_type_id="ot1",
            rule_type="object_create",
            description=None,
            function_id=None,
            function_version=None,
            parameters_json=None,
        )
    )
    body = json.loads(recorded[-1].content)
    assert body["api_name"] == "createWorkItem"
    assert body["rule_type"] == "object_create"
    assert "function_id" not in body


def test_action_types_create_function_backed(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/ontology/action-types")] = (201, {"id": "at2"})
    from openkms.commands.action_types import cmd_create

    cmd_create(
        _ns(
            api_name="addToWatchlist",
            display_name="Add",
            object_type_id="ot1",
            rule_type="function",
            description=None,
            function_id="fn1",
            function_version=None,
            parameters_json=None,
        )
    )
    body = json.loads(recorded[-1].content)
    assert body["rule_type"] == "function"
    assert body["function_id"] == "fn1"


def test_action_types_update_clear_function(mock_api):
    recorded, responses = mock_api
    responses[("PATCH", "/api/ontology/action-types/at1")] = (200, {"id": "at1"})
    from openkms.commands.action_types import cmd_update

    cmd_update(
        _ns(
            id="at1",
            display_name=None,
            description=None,
            rule_type="object_modify",
            function_id=None,
            clear_function=True,
            function_version=None,
            parameters_json=None,
            status=None,
        )
    )
    body = json.loads(recorded[-1].content)
    assert body["rule_type"] == "object_modify"
    assert body["function_id"] is None
    assert body["function_version"] is None


def test_action_types_delete(mock_api):
    recorded, responses = mock_api
    responses[("DELETE", "/api/ontology/action-types/at1")] = (204, b"")
    from openkms.commands.action_types import cmd_delete

    cmd_delete(_ns(id="at1"))
    assert recorded[-1].method == "DELETE"
    assert recorded[-1].url.path == "/api/ontology/action-types/at1"


def test_comments_list(mock_api):
    recorded, _ = mock_api
    from openkms.commands.comments import cmd_list

    cmd_list(_ns(resource_type="document", resource_id="d1", limit=None, offset=None))
    assert recorded[-1].url.path == "/api/comments"
    assert recorded[-1].url.params["resource_type"] == "document"


def test_kb_wiki_spaces_link(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/knowledge-bases/kb1/wiki-spaces")] = (200, {"ok": True})
    from openkms.commands.kb import cmd_wiki_spaces_link

    cmd_wiki_spaces_link(_ns(kb_id="kb1", space_id="sp1"))
    assert json.loads(recorded[-1].content) == {"wiki_space_id": "sp1"}


# --- Data Insights: a story of findings, each with its own source ---


def test_story_create_from_a_findings_file(mock_api, tmp_path):
    recorded, responses = mock_api
    responses[("POST", "/api/stories")] = (201, {"id": "d1"})
    from openkms.commands.stories import cmd_create

    findings = tmp_path / "findings.json"
    findings.write_text(
        json.dumps(
            [
                {"title": "P/E by industry", "semantic_model_id": "m1", "query": {"metric": "pe"}},
                {
                    "title": "Null share",
                    "dataset_id": "d1",
                    "query": {"aggregates": [{"fn": "count"}]},
                },
            ]
        ),
        encoding="utf-8",
    )

    cmd_create(_ns(name="Valuation", question=None, narrative=None, narrative_file=None, findings_file=str(findings)))
    body = json.loads(recorded[-1].content)
    assert body["name"] == "Valuation"
    # The story carries no source of its own: every finding names the one it reads.
    assert "dataset_id" not in body and "source_kind" not in body
    assert [r["title"] for r in body["findings"]] == ["P/E by industry", "Null share"]
    assert body["findings"][0]["semantic_model_id"] == "m1"
    assert body["findings"][1]["dataset_id"] == "d1"


def test_story_finding_without_a_source_is_refused(tmp_path):
    import pytest

    from openkms.commands.stories import cmd_create

    findings = tmp_path / "findings.json"
    findings.write_text('[{"title": "Nowhere", "query": {}}]', encoding="utf-8")
    with pytest.raises(SystemExit, match="names no source"):
        cmd_create(_ns(name="X", question=None, narrative=None, narrative_file=None, findings_file=str(findings)))


def test_story_run(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/stories/d1/run")] = (200, {"id": "d1", "findings": []})
    from openkms.commands.stories import cmd_run

    cmd_run(_ns(id="d1"))
    assert recorded[-1].method == "POST"
    assert recorded[-1].url.path == "/api/stories/d1/run"


def test_semantic_model_get(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/semantic-models/m1")] = (200, {"id": "m1", "name": "Stock", "datasets": []})
    from openkms.commands.semantic_models import cmd_get

    cmd_get(_ns(id="m1"))
    assert recorded[-1].url.path == "/api/semantic-models/m1"


def test_metric_datatype_is_checked_before_sending():
    """The API answers 400 with the whitelist; the CLI should refuse locally with the same list."""
    import subprocess
    import sys
    from pathlib import Path

    cli = Path(__file__).resolve().parents[1] / "scripts" / "cli.py"
    out = subprocess.run(
        [
            sys.executable,
            str(cli),
            "metrics",
            "add",
            "--datatype",
            "number",
            "--name",
            "x",
            "--semantic-model-id",
            "m",
            "--base-dataset-id",
            "d",
            "--expression",
            "AVG(1)",
            "--dry-run",
        ],
        capture_output=True,
        text=True,
    )
    assert out.returncode != 0
    assert "invalid choice: 'number'" in out.stderr
    assert "Decimal" in out.stderr


def test_datasets_aggregate(mock_api):
    recorded, _ = mock_api
    from openkms.commands.datasets import cmd_aggregate

    cmd_aggregate(
        _ns(
            id="d1",
            group_by="trade_date",
            granularity="month",
            aggregate=["count", "avg:pe_ttm=avg_pe"],
            filter=["pe_ttm > 0"],
            order_by="trade_date",
            order_direction="asc",
            limit=12,
            offset=None,
        )
    )
    assert recorded[-1].method == "POST"
    assert recorded[-1].url.path == "/api/datasets/d1/aggregate"
    assert json.loads(recorded[-1].content) == {
        "group_by": [{"column": "trade_date", "granularity": "month"}],
        "aggregates": [
            {"fn": "count"},
            {"fn": "avg", "column": "pe_ttm", "name": "avg_pe"},
        ],
        "filters": [{"field": "pe_ttm", "op": ">", "value": "0"}],
        "order_by": [{"field": "trade_date", "direction": "asc"}],
        "limit": 12,
        "offset": 0,
    }


def test_quality_run_findings_the_run_it_produced(mock_api):
    """The run endpoint answers with the *rule*; the numbers live in the history, so the command
    fetches it and prints that — otherwise a caller only ever sees `passed` / `failed`."""
    recorded, responses = mock_api
    responses[("POST", "/api/datasets/d1/quality-rules/r1/run")] = (200, {"id": "r1", "last_status": "failed"})
    responses[("GET", "/api/datasets/d1/quality-rules/r1/runs")] = (
        200,
        [{"id": "run1", "status": "failed", "checked_count": 10, "failed_count": 3}],
    )
    from openkms.commands.datasets import cmd_quality_run

    cmd_quality_run(_ns(id="d1", rule_id="r1", yes=True, dry_run=False))
    assert recorded[-1].method == "GET"
    assert recorded[-1].url.path == "/api/datasets/d1/quality-rules/r1/runs"


def test_quality_runs_lists_the_history(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/datasets/d1/quality-rules/r1/runs")] = (200, [{"id": "run1"}])
    from openkms.commands.datasets import cmd_quality_runs

    cmd_quality_runs(_ns(id="d1", rule_id="r1", limit=20, before=None, before_id=None))
    assert recorded[-1].url.path == "/api/datasets/d1/quality-rules/r1/runs"
    # The list is paged: the command always says how many, and pages only when given a cursor.
    assert recorded[-1].url.params["limit"] == "20"
    assert "before" not in recorded[-1].url.params


def test_api_spec_indexes_the_operations_under_a_path(mock_api, capsys):
    recorded, responses = mock_api
    responses[("GET", "/openapi.json")] = (
        200,
        {
            "paths": {
                "/api/stories": {"get": {"summary": "List stories"}, "post": {"summary": "Create"}},
                "/api/stories/{story_id}": {"get": {"summary": "Get a story"}},
                "/api/datasets": {"get": {"summary": "List datasets"}},
            }
        },
    )
    from openkms.commands.api import cmd_api_spec

    cmd_api_spec(_ns(path="/api/stories", method="GET", full=False))
    out = capsys.readouterr().out
    assert "/api/stories" in out and "Get a story" in out
    assert "/api/datasets" not in out          # the prefix narrowed it
    assert '"post"' not in out                  # --method narrowed it


def test_audit_list_narrows_by_what_changed(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/console/audit-events")] = (200, {"items": [], "total": 0})
    from openkms.commands.audit import cmd_audit_list

    cmd_audit_list(
        _ns(actor="ag-1", resource_type="datasets", resource_id="d1", method="PUT", path=None, since=None, limit=20)
    )
    params = recorded[-1].url.params
    assert params["actor_sub"] == "ag-1"
    assert params["resource_id"] == "d1"
    assert params["limit"] == "20"
    assert "path" not in params
