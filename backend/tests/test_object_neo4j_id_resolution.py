"""Object identity: which properties name an object, and what the API id looks like.

A table unique on a *pair* of columns has no single-column identity, so the identity is the whole
key: the API id is its encoded join, and a MERGE matches on every column of it.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.models.object_instance import ObjectInstance
from app.services.ontology.object_neo4j_store import (
    SYSTEM_RID_PROPERTY,
    decode_object_id,
    encode_object_id,
    instance_row_for_neo4j,
    object_key_properties,
    resolve_id_properties,
    resolve_write_id_columns,
)


def _ot(**kwargs):
    defaults = {
        "dataset_id": None,
        "key_properties": [],
        "properties": [
            {"name": "title", "type": "string"},
            {"name": "status", "type": "string"},
        ],
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def test_a_hand_created_type_is_identified_by_the_platform_rid():
    ot = _ot(key_properties=["title"])
    assert resolve_write_id_columns(ot) == [SYSTEM_RID_PROPERTY]
    assert resolve_id_properties(ot) == [SYSTEM_RID_PROPERTY]


def test_the_instance_row_keeps_the_business_fields_and_carries_the_rid():
    ot = _ot(key_properties=["title"])
    inst = ObjectInstance(
        id="9d59b102-6d52-4a31-bf25-63ee430a2ad3",
        object_type_id="ot-workitem",
        data={"title": "制定周目标", "status": "To Do"},
    )
    row = instance_row_for_neo4j(ot, inst)
    assert row[SYSTEM_RID_PROPERTY] == inst.id
    assert "id" not in row
    assert row["title"] == "制定周目标"


def test_a_stale_rid_in_instance_data_is_not_written():
    ot = _ot()
    inst = ObjectInstance(
        id="9d59b102-6d52-4a31-bf25-63ee430a2ad3",
        object_type_id="ot-workitem",
        data={"title": "x", "__rid": "stale"},
    )
    row = instance_row_for_neo4j(ot, inst)
    assert row[SYSTEM_RID_PROPERTY] == inst.id


def test_a_dataset_backed_type_uses_its_declared_key_columns():
    ot = _ot(
        dataset_id="ds-1",
        key_properties=["ts_code"],
        properties=[{"name": "ts_code", "type": "string"}, {"name": "name", "type": "string"}],
    )
    assert resolve_write_id_columns(ot) == ["ts_code"]
    assert resolve_id_properties(ot) == ["ts_code"]


def test_a_composite_key_is_every_column_not_the_surrogate():
    ot = _ot(
        dataset_id="ds-1",
        key_properties=["portfolio_id", "ts_code"],
        properties=[
            {"name": "id", "type": "string"},
            {"name": "portfolio_id", "type": "string"},
            {"name": "ts_code", "type": "string"},
        ],
    )
    assert resolve_write_id_columns(ot) == ["portfolio_id", "ts_code"]


def test_the_api_id_is_the_encoded_key():
    assert encode_object_id(["b10f1cca", "600519.SH"]) == "b10f1cca|600519.SH"
    assert decode_object_id("b10f1cca|600519.SH", ["portfolio_id", "ts_code"]) == [
        "b10f1cca",
        "600519.SH",
    ]
    # Values with the separator survive the round trip.
    value = encode_object_id(["a|b", "c"])
    assert decode_object_id(value, ["k1", "k2"]) == ["a|b", "c"]


def test_an_id_with_the_wrong_number_of_parts_is_rejected():
    with pytest.raises(ValueError, match="need 2"):
        decode_object_id("onlyone", ["portfolio_id", "ts_code"])


def test_a_row_missing_part_of_the_key_is_not_mergeable():
    ot = _ot(
        dataset_id="ds-1",
        key_properties=["portfolio_id", "ts_code"],
        properties=[{"name": "portfolio_id", "type": "string"}, {"name": "ts_code", "type": "string"}],
    )
    # Both declared columns present → the declared pair.
    assert object_key_properties(ot, sample_row={"portfolio_id": "p", "ts_code": "t"}) == [
        "portfolio_id",
        "ts_code",
    ]
    # A row that lacks them falls back to `id` rather than merging on half a key.
    assert object_key_properties(ot, sample_row={"id": "x"}) == ["id"]
