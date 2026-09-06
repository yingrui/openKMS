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

    cmd_rows(_ns(id="d1", limit=10, offset=0))
    assert recorded[-1].url.path == "/api/datasets/d1/rows"


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
