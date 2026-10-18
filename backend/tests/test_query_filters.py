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
