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
    _validate_property_refs(
        properties=PROPS, key_properties=["ts_code"], display_property="trade_date"
    )
    _validate_property_refs(
        properties=PROPS, key_properties=["ts_code", "trade_date"], display_property=""
    )
    _validate_property_refs(properties=PROPS, key_properties=[], display_property=None)


def test_an_undeclared_key_column_is_rejected():
    with pytest.raises(HTTPException) as ei:
        _validate_property_refs(properties=PROPS, key_properties=["ts-code"], display_property=None)
    assert ei.value.status_code == 400
    assert "key_properties" in str(ei.value.detail)


def test_one_bad_composite_key_column_is_enough_to_reject():
    with pytest.raises(HTTPException):
        _validate_property_refs(
            properties=PROPS, key_properties=["ts_code", "nope"], display_property=None
        )


def test_undeclared_display_property_is_rejected():
    with pytest.raises(HTTPException) as ei:
        _validate_property_refs(properties=PROPS, key_properties=[], display_property="title")
    assert ei.value.status_code == 400
    assert "display_property" in str(ei.value.detail)


def test_a_type_without_properties_is_still_creatable():
    """Modeling the id before the schema is a legal order of operations."""
    _validate_property_refs(properties=[], key_properties=["ts_code"], display_property="trade_date")


# --- prune safety -----------------------------------------------------------
def test_prune_declines_an_empty_source():
    """An empty keep-set is a broken read far more often than 'delete every node'."""
    from app.services.ontology.object_neo4j_store import prune_refused_reason

    assert prune_refused_reason(set()) is not None
    assert "no rows" in prune_refused_reason(set())


def test_prune_declines_a_fact_table_sized_key_set():
    from app.services.ontology.object_neo4j_store import PRUNE_KEY_LIMIT, prune_refused_reason

    assert prune_refused_reason({"a"}) is None
    assert prune_refused_reason(set(str(i) for i in range(PRUNE_KEY_LIMIT + 1))) is not None
