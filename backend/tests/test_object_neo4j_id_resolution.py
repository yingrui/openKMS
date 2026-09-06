"""Unit tests for Neo4j object id / MERGE column resolution."""

from __future__ import annotations

from types import SimpleNamespace

from app.models.object_instance import ObjectInstance
from app.services.ontology.object_neo4j_store import (
    SYSTEM_RID_PROPERTY,
    instance_row_for_neo4j,
    resolve_id_property,
    resolve_write_id_column,
)


def _ot(**kwargs):
    defaults = {
        "dataset_id": None,
        "key_property": None,
        "properties": [
            {"name": "title", "type": "string"},
            {"name": "status", "type": "string"},
        ],
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def test_no_dataset_write_id_ignores_key_property_title():
    ot = _ot(key_property="title")
    assert resolve_write_id_column(ot) == SYSTEM_RID_PROPERTY
    assert resolve_id_property(ot) == SYSTEM_RID_PROPERTY


def test_no_dataset_instance_row_keeps_business_title():
    ot = _ot(key_property="title")
    inst = ObjectInstance(
        id="9d59b102-6d52-4a31-bf25-63ee430a2ad3",
        object_type_id="ot-workitem",
        data={"title": "制定周目标", "status": "To Do", "estimate": 1, "priority": "high"},
    )
    row = instance_row_for_neo4j(ot, inst)
    assert row[SYSTEM_RID_PROPERTY] == inst.id
    assert "id" not in row
    assert row["title"] == "制定周目标"
    assert row["status"] == "To Do"


def test_no_dataset_strips_rid_from_instance_data_on_write():
    ot = _ot()
    inst = ObjectInstance(
        id="9d59b102-6d52-4a31-bf25-63ee430a2ad3",
        object_type_id="ot-workitem",
        data={"title": "x", "__rid": "stale"},
    )
    row = instance_row_for_neo4j(ot, inst)
    assert row[SYSTEM_RID_PROPERTY] == inst.id


def test_dataset_backed_uses_key_property_for_merge():
    ot = _ot(
        dataset_id="ds-1",
        key_property="ts_code",
        properties=[{"name": "ts_code", "type": "string"}, {"name": "name", "type": "string"}],
    )
    assert resolve_write_id_column(ot) == "ts_code"
    assert resolve_id_property(ot) == "ts_code"
