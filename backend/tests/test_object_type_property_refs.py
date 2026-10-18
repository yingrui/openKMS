"""Object type schema refs must point at declared properties.

`key_property` / `display_property` naming a property the type does not declare used to resolve
silently to a *different* column, so the list id and the Action `object_id` disagreed about what an
object's identity is. The API now rejects the name instead of guessing.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.object_types import (
    _dataset_id_candidates,
    _dataset_row_id,
    _validate_property_refs,
)

PROPS = [
    {"name": "ts_code", "type": "string"},
    {"name": "trade_date", "type": "date"},
]


def test_declared_refs_are_accepted():
    _validate_property_refs(properties=PROPS, key_property="ts_code", display_property="trade_date")
    _validate_property_refs(properties=PROPS, key_property=None, display_property="")


def test_undeclared_key_property_is_rejected():
    with pytest.raises(HTTPException) as ei:
        _validate_property_refs(properties=PROPS, key_property="ts-code", display_property=None)
    assert ei.value.status_code == 400
    assert "key_property" in str(ei.value.detail)


def test_undeclared_display_property_is_rejected():
    with pytest.raises(HTTPException) as ei:
        _validate_property_refs(properties=PROPS, key_property=None, display_property="title")
    assert ei.value.status_code == 400
    assert "display_property" in str(ei.value.detail)


def test_a_type_without_properties_is_still_creatable():
    """Modeling the id before the schema is a legal order of operations."""
    _validate_property_refs(properties=[], key_property="ts_code", display_property="trade_date")


def _ot(**kwargs):
    defaults = {"dataset_id": "ds", "key_property": None, "properties": PROPS}
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def test_dataset_row_id_prefers_key_property():
    assert _dataset_row_id(_ot(key_property="ts_code"), {"ts_code": "000001.SZ", "id": "x"}) == (
        "000001.SZ"
    )


def test_dataset_row_id_ignores_a_key_property_missing_from_the_row():
    """A dataset can change under a saved schema; the row's own columns win."""
    assert _dataset_row_id(_ot(key_property="ts_code"), {"id": "x", "trade_date": "2026-01-31"}) == "x"


def test_dataset_row_id_falls_back_to_the_first_column_like_the_indexer():
    """No key, no `id`: whatever the indexer MERGEs on is what the row is listed as."""
    assert _dataset_row_id(_ot(properties=[]), {"other": 1}) == 1


def test_dataset_row_id_is_none_for_an_empty_row():
    assert _dataset_row_id(_ot(properties=[]), {}) is None


def test_dataset_id_candidates_are_deduplicated_and_ordered():
    candidates = _dataset_id_candidates(_ot(key_property="ts_code"))
    assert candidates == ["ts_code", "id", "trade_date"]


def test_dataset_id_candidates_put_id_first_without_a_key_property():
    assert _dataset_id_candidates(_ot(key_property=None)) == ["id", "ts_code", "trade_date"]
