"""Unit tests for object list property filters and related helpers."""

from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.services.ontology.query_filters import parse_prop_filters, row_matches_prop_filters


def _request_with_query(items: list[tuple[str, str]]):
    req = MagicMock()
    # Starlette QueryParams-like: multi_items()
    qp = MagicMock()
    qp.multi_items.return_value = items
    req.query_params = qp
    return req


def test_parse_prop_filters_empty():
    assert parse_prop_filters(_request_with_query([])) == {}
    assert parse_prop_filters(_request_with_query([("search", "x"), ("limit", "10")])) == {}


def test_parse_prop_filters_equality():
    req = _request_with_query(
        [("prop.status", "in_progress"), ("prop.priority", "high"), ("search", "foo")]
    )
    assert parse_prop_filters(req) == {"status": "in_progress", "priority": "high"}


def test_parse_prop_filters_rejects_bad_name():
    with pytest.raises(HTTPException) as ei:
        parse_prop_filters(_request_with_query([("prop.status;drop", "x")]))
    assert ei.value.status_code == 400


def test_row_matches_prop_filters():
    assert row_matches_prop_filters({"status": "done"}, {"status": "done"})
    assert not row_matches_prop_filters({"status": "done"}, {"status": "open"})
    assert row_matches_prop_filters({"n": 1}, {"n": "1"})
    assert row_matches_prop_filters({}, {})


def test_object_instance_conditions_bound_properties():
    """Queue-path filters must be SQL predicates, not a post-page in-memory sweep."""
    from sqlalchemy.dialects import postgresql

    from app.models.object_instance import ObjectInstance
    from app.services.ontology.query_filters import object_instance_conditions

    search, equality = object_instance_conditions(ObjectInstance, {"status": "done"}, "weekly target")
    search_sql = str(search.compile(dialect=postgresql.dialect()))
    assert "object_instances.data" in search_sql
    assert "LIKE" in search_sql.upper()
    assert list(search.compile(dialect=postgresql.dialect()).params.values()) == ["%weekly target%"]

    equality_compiled = equality.compile(dialect=postgresql.dialect())
    assert "->>" in str(equality_compiled)
    # Both the JSONB key and the value are bound, so neither can reach the SQL text.
    assert sorted(equality_compiled.params.values(), key=str) == ["done", "status"]


def test_object_instance_conditions_without_filters_is_empty():
    from app.models.object_instance import ObjectInstance
    from app.services.ontology.query_filters import object_instance_conditions

    assert object_instance_conditions(ObjectInstance, {}, None) == []
    assert object_instance_conditions(ObjectInstance, {}, "   ") == []


def test_object_instance_conditions_rejects_bad_filter_name():
    from app.models.object_instance import ObjectInstance
    from app.services.ontology.query_filters import object_instance_conditions

    with pytest.raises(HTTPException) as ei:
        object_instance_conditions(ObjectInstance, {"status;drop": "x"}, None)
    assert ei.value.status_code == 400
