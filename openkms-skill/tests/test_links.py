"""links — list/get + write CRUD with confirm gating."""
from __future__ import annotations

import argparse
import json
import sys

import pytest


def _ns(**kw):
    defaults = dict(yes=True, dry_run=False)
    defaults.update(kw)
    return argparse.Namespace(**defaults)


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------
def test_links_list_default(mock_api):
    recorded, _ = mock_api
    from openkms.commands.links import cmd_list
    cmd_list(_ns(count_from_neo4j=False))

    req = recorded[-1]
    assert req.method == "GET"
    assert req.url.path == "/api/link-types"
    assert "count_from_neo4j" not in req.url.params


def test_links_list_count_flag(mock_api):
    recorded, _ = mock_api
    from openkms.commands.links import cmd_list
    cmd_list(_ns(count_from_neo4j=True))
    assert recorded[-1].url.params["count_from_neo4j"] == "true"


def test_links_get(mock_api):
    recorded, _ = mock_api
    from openkms.commands.links import cmd_get
    cmd_get(_ns(id="lt1", count_from_neo4j=False))

    assert recorded[-1].url.path == "/api/link-types/lt1"


def test_instances_list(mock_api):
    recorded, _ = mock_api
    from openkms.commands.links import cmd_instances_list
    cmd_instances_list(_ns(type_id="lt1", limit=20, offset=0))

    req = recorded[-1]
    assert req.url.path == "/api/link-types/lt1/links"
    assert req.url.params["limit"] == "20"
    assert "offset" not in req.url.params  # 0 is treated as "not set"


# ---------------------------------------------------------------------------
# Write — types
# ---------------------------------------------------------------------------
def test_create_type_yes_full_body(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/link-types")] = (200, {"id": "lt9"})

    from openkms.commands.links import cmd_create_type
    cmd_create_type(_ns(
        name="covers",
        source_type_id="ot_product",
        target_type_id="ot_disease",
        cardinality="many-to-many",
        description="product covers disease",
        dataset_id="ds_junction",
        source_key_property="product_id",
        target_key_property="icd",
        source_dataset_column="prod_id",
        target_dataset_column="disease_icd",
    ))

    body = json.loads(recorded[-1].content)
    assert body == {
        "name": "covers",
        "source_object_type_id": "ot_product",
        "target_object_type_id": "ot_disease",
        "cardinality": "many-to-many",
        "description": "product covers disease",
        "dataset_id": "ds_junction",
        "source_key_property": "product_id",
        "target_key_property": "icd",
        "source_dataset_column": "prod_id",
        "target_dataset_column": "disease_icd",
    }


def test_create_type_dry_run(mock_api):
    recorded, _ = mock_api
    from openkms.commands.links import cmd_create_type
    with pytest.raises(SystemExit) as exc:
        cmd_create_type(_ns(
            name="x", source_type_id="a", target_type_id="b",
            cardinality="one-to-many", description="", dataset_id="",
            source_key_property="", target_key_property="",
            source_dataset_column="", target_dataset_column="",
            yes=False, dry_run=True,
        ))
    assert exc.value.code == 0
    assert recorded == []


def test_create_type_non_tty_aborts(mock_api, monkeypatch):
    recorded, _ = mock_api
    monkeypatch.setattr(sys.stdin, "isatty", lambda: False)

    from openkms.commands.links import cmd_create_type
    with pytest.raises(SystemExit) as exc:
        cmd_create_type(_ns(
            name="x", source_type_id="a", target_type_id="b",
            cardinality="one-to-many", description="", dataset_id="",
            source_key_property="", target_key_property="",
            source_dataset_column="", target_dataset_column="",
            yes=False, dry_run=False,
        ))
    assert exc.value.code == 2
    assert recorded == []


def test_update_type_only_sends_provided(mock_api):
    recorded, _ = mock_api
    from openkms.commands.links import cmd_update_type
    cmd_update_type(_ns(
        id="lt1", name=None, description="updated description",
        source_type_id=None, target_type_id=None, cardinality=None,
        dataset_id=None, source_key_property=None, target_key_property=None,
        source_dataset_column=None, target_dataset_column=None,
    ))

    body = json.loads(recorded[-1].content)
    assert body == {"description": "updated description"}
    assert recorded[-1].method == "PUT"


def test_update_type_aborts_when_empty():
    from openkms.commands.links import cmd_update_type
    with pytest.raises(SystemExit) as exc:
        cmd_update_type(_ns(
            id="lt1", name=None, description=None, source_type_id=None,
            target_type_id=None, cardinality=None, dataset_id=None,
            source_key_property=None, target_key_property=None,
            source_dataset_column=None, target_dataset_column=None,
        ))
    assert exc.value.code == 2


def test_delete_type_yes(mock_api):
    recorded, _ = mock_api
    from openkms.commands.links import cmd_delete_type
    cmd_delete_type(_ns(id="lt1"))

    assert recorded[-1].method == "DELETE"
    assert recorded[-1].url.path == "/api/link-types/lt1"


# ---------------------------------------------------------------------------
# Instances + sync
# ---------------------------------------------------------------------------
def test_instances_create_yes(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/link-types/lt1/links")] = (200, {"id": "li1"})

    from openkms.commands.links import cmd_instances_create
    cmd_instances_create(_ns(type_id="lt1", source_object_id="oi_a", target_object_id="oi_b"))

    body = json.loads(recorded[-1].content)
    assert body == {"source_object_id": "oi_a", "target_object_id": "oi_b"}


def test_instances_delete_yes(mock_api):
    recorded, _ = mock_api
    from openkms.commands.links import cmd_instances_delete
    cmd_instances_delete(_ns(type_id="lt1", id="li1"))

    assert recorded[-1].method == "DELETE"
    assert recorded[-1].url.path == "/api/link-types/lt1/links/li1"


def test_sync_neo4j_yes(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/link-types/index-to-neo4j")] = (
        200, {"link_types_indexed": 0, "relationships_created": 0},
    )

    from openkms.commands.links import cmd_sync_neo4j
    cmd_sync_neo4j(_ns(neo4j_data_source_id="ds1"))

    assert json.loads(recorded[-1].content) == {"neo4j_data_source_id": "ds1"}


def test_sync_neo4j_type_yes(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/link-types/lt1/index-to-neo4j")] = (
        200, {"link_types_indexed": 1, "relationships_created": 2},
    )
    from openkms.commands.links import cmd_sync_neo4j_type
    cmd_sync_neo4j_type(_ns(type_id="lt1", neo4j_data_source_id="ds1"))
    assert recorded[-1].method == "POST"
    assert recorded[-1].url.path == "/api/link-types/lt1/index-to-neo4j"
    assert json.loads(recorded[-1].content) == {"neo4j_data_source_id": "ds1"}
