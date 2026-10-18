"""Object type schema refs must point at declared properties.

`key_property` / `display_property` naming a property the type does not declare used to resolve
silently to a *different* column, so the list id and the Action `object_id` disagreed about what an
object's identity is. The API now rejects the name instead of guessing.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.api.object_types import _validate_property_refs

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
