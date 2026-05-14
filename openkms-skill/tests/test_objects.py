"""objects — list/get + write CRUD with confirm gating."""
from __future__ import annotations

import argparse
import json
import sys

import pytest


def _ns(**kw):
    """Build a Namespace with sane defaults for write commands (yes=True by default)."""
    defaults = dict(yes=True, dry_run=False)
    defaults.update(kw)
    return argparse.Namespace(**defaults)


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------
def test_objects_list_default_no_params(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/object-types")] = (200, {"items": [], "total": 0})

    from openkms.commands.objects import cmd_list
    cmd_list(_ns(master_data_only=False, count_from_neo4j=False))

    req = recorded[-1]
    assert req.method == "GET"
    assert req.url.path == "/api/object-types"
    assert "is_master_data" not in req.url.params
    assert "count_from_neo4j" not in req.url.params


def test_objects_list_with_filters(mock_api):
    recorded, _ = mock_api
    from openkms.commands.objects import cmd_list
    cmd_list(_ns(master_data_only=True, count_from_neo4j=True))

    p = recorded[-1].url.params
    assert p["is_master_data"] == "true"
    assert p["count_from_neo4j"] == "true"


def test_objects_get(mock_api):
    recorded, _ = mock_api
    from openkms.commands.objects import cmd_get
    cmd_get(_ns(id="ot1", count_from_neo4j=True))

    req = recorded[-1]
    assert req.method == "GET"
    assert req.url.path == "/api/object-types/ot1"
    assert req.url.params["count_from_neo4j"] == "true"


# ---------------------------------------------------------------------------
# Write — types: dry-run, confirm, yes
# ---------------------------------------------------------------------------
def test_create_type_dry_run_makes_no_request(mock_api, capsys):
    recorded, _ = mock_api

    from openkms.commands.objects import cmd_create_type
    with pytest.raises(SystemExit) as exc:
        cmd_create_type(_ns(
            name="Disease", description="", dataset_id="", key_property="",
            is_master_data=False, display_property="",
            properties_json='[{"name":"icd","type":"string"}]',
            yes=False, dry_run=True,
        ))
    assert exc.value.code == 0
    assert recorded == []
    assert "DRY-RUN" in capsys.readouterr().out


def test_create_type_yes_posts_correct_body(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/object-types")] = (200, {"id": "ot9", "name": "Disease"})

    from openkms.commands.objects import cmd_create_type
    cmd_create_type(_ns(
        name="Disease", description="ICD-10", dataset_id="", key_property="icd",
        is_master_data=True, display_property="name",
        properties_json='[{"name":"icd","type":"string","required":true}]',
    ))

    body = json.loads(recorded[-1].content)
    assert body == {
        "name": "Disease",
        "is_master_data": True,
        "description": "ICD-10",
        "key_property": "icd",
        "display_property": "name",
        "properties": [{"name": "icd", "type": "string", "required": True}],
    }


def test_create_type_non_tty_aborts_without_yes(mock_api, monkeypatch):
    recorded, _ = mock_api
    monkeypatch.setattr(sys.stdin, "isatty", lambda: False)

    from openkms.commands.objects import cmd_create_type
    with pytest.raises(SystemExit) as exc:
        cmd_create_type(_ns(
            name="X", description="", dataset_id="", key_property="",
            is_master_data=False, display_property="", properties_json="",
            yes=False, dry_run=False,
        ))
    assert exc.value.code == 2
    assert recorded == []


def test_update_type_only_sends_provided_fields(mock_api):
    recorded, _ = mock_api

    from openkms.commands.objects import cmd_update_type
    cmd_update_type(_ns(
        id="ot1",
        name="NewName",
        description=None, dataset_id=None, key_property=None,
        is_master_data=None, display_property=None, properties_json=None,
    ))

    body = json.loads(recorded[-1].content)
    assert body == {"name": "NewName"}
    assert recorded[-1].method == "PUT"
    assert recorded[-1].url.path == "/api/object-types/ot1"


def test_update_type_aborts_when_nothing_to_update():
    from openkms.commands.objects import cmd_update_type
    with pytest.raises(SystemExit) as exc:
        cmd_update_type(_ns(
            id="ot1", name=None, description=None, dataset_id=None,
            key_property=None, is_master_data=None, display_property=None,
            properties_json=None,
        ))
    assert exc.value.code == 2


def test_delete_type_yes(mock_api):
    recorded, _ = mock_api

    from openkms.commands.objects import cmd_delete_type
    cmd_delete_type(_ns(id="ot1"))

    assert recorded[-1].method == "DELETE"
    assert recorded[-1].url.path == "/api/object-types/ot1"


# ---------------------------------------------------------------------------
# Instances
# ---------------------------------------------------------------------------
def test_instances_list(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/object-types/ot1/objects")] = (200, {"items": [], "total": 0})

    from openkms.commands.objects import cmd_instances_list
    cmd_instances_list(_ns(type_id="ot1", search="foo", limit=10, offset=5))

    req = recorded[-1]
    assert req.url.path == "/api/object-types/ot1/objects"
    assert req.url.params["search"] == "foo"
    assert req.url.params["limit"] == "10"
    assert req.url.params["offset"] == "5"


def test_instances_create_yes(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/object-types/ot1/objects")] = (200, {"id": "oi1"})

    from openkms.commands.objects import cmd_instances_create
    cmd_instances_create(_ns(
        type_id="ot1", data_json='{"icd": "C50", "name": "breast cancer"}',
    ))

    req = recorded[-1]
    assert req.method == "POST"
    assert req.url.path == "/api/object-types/ot1/objects"
    assert json.loads(req.content) == {"data": {"icd": "C50", "name": "breast cancer"}}


def test_instances_create_rejects_non_object_data(mock_api):
    from openkms.commands.objects import cmd_instances_create
    with pytest.raises(SystemExit) as exc:
        cmd_instances_create(_ns(type_id="ot1", data_json='[1,2,3]'))
    assert exc.value.code == 2


def test_instances_update_yes(mock_api):
    recorded, _ = mock_api
    from openkms.commands.objects import cmd_instances_update
    cmd_instances_update(_ns(type_id="ot1", id="oi9", data_json='{"icd":"C50.1"}'))

    req = recorded[-1]
    assert req.method == "PUT"
    assert req.url.path == "/api/object-types/ot1/objects/oi9"
    assert json.loads(req.content) == {"data": {"icd": "C50.1"}}


def test_instances_delete_yes(mock_api):
    recorded, _ = mock_api
    from openkms.commands.objects import cmd_instances_delete
    cmd_instances_delete(_ns(type_id="ot1", id="oi9"))

    assert recorded[-1].method == "DELETE"
    assert recorded[-1].url.path == "/api/object-types/ot1/objects/oi9"


# ---------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------
def test_sync_neo4j_yes(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/object-types/index-to-neo4j")] = (
        200, {"object_types_indexed": 5, "nodes_created": 100},
    )

    from openkms.commands.objects import cmd_sync_neo4j
    cmd_sync_neo4j(_ns(neo4j_data_source_id="ds1"))

    body = json.loads(recorded[-1].content)
    assert body == {"neo4j_data_source_id": "ds1"}


def test_sync_neo4j_dry_run(mock_api):
    recorded, _ = mock_api
    from openkms.commands.objects import cmd_sync_neo4j
    with pytest.raises(SystemExit) as exc:
        cmd_sync_neo4j(_ns(neo4j_data_source_id="ds1", yes=False, dry_run=True))
    assert exc.value.code == 0
    assert recorded == []


def test_sync_neo4j_type_yes(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/object-types/ot1/index-to-neo4j")] = (
        200, {"object_types_indexed": 1, "nodes_created": 3},
    )
    from openkms.commands.objects import cmd_sync_neo4j_type
    cmd_sync_neo4j_type(_ns(type_id="ot1", neo4j_data_source_id="ds1"))
    assert recorded[-1].method == "POST"
    assert recorded[-1].url.path == "/api/object-types/ot1/index-to-neo4j"
    assert json.loads(recorded[-1].content) == {"neo4j_data_source_id": "ds1"}
