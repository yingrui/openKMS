"""Tests for connector sync date range parsing."""

from datetime import date

import pytest

from app.services.connectors.sync_range import parse_sync_date_range


def test_parse_omitted_dates():
    r = parse_sync_date_range(None, None)
    assert r.is_explicit is False
    assert r.start is None
    assert r.end is None


def test_parse_explicit_range():
    r = parse_sync_date_range("2025-01-01", "2025-12-31")
    assert r.is_explicit is True
    assert r.start == date(2025, 1, 1)
    assert r.end == date(2025, 12, 31)


def test_parse_rejects_partial_dates():
    with pytest.raises(ValueError, match="both"):
        parse_sync_date_range("2025-01-01", None)


def test_parse_rejects_inverted_range():
    with pytest.raises(ValueError, match="on or before"):
        parse_sync_date_range("2025-12-31", "2025-01-01")
