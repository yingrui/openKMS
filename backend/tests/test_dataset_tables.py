"""Rows paging rules for the Catalog half (pure — no DB)."""

from __future__ import annotations

import pytest

from app.services.ontology.dataset_tables import keyset_cursor_error


def _raise_for(sort: str | None, after: str | None) -> None:
    if (message := keyset_cursor_error(sort, after)) is not None:
        raise ValueError(message)


def test_a_cursor_without_a_sort_column_is_rejected():
    """Silently ignoring it would hand a paging caller the first page again."""
    with pytest.raises(ValueError, match="requires `sort`"):
        _raise_for("", "2026-01-31")


def test_a_cursor_with_a_valid_sort_column_is_fine():
    assert keyset_cursor_error("trade_date", "2026-01-31") is None
    assert keyset_cursor_error("trade_date", None) is None
    assert keyset_cursor_error("trade_date", "") is None


def test_a_cursor_with_an_unusable_sort_column_is_rejected():
    assert keyset_cursor_error('bad"name', "x") is not None
    assert keyset_cursor_error(None, "x") is not None


def test_the_rows_page_validates_the_cursor_before_reading_the_dataset():
    """The endpoint turns this ValueError into a 400 (see app/api/datasets.py)."""
    import asyncio

    from app.services.ontology.dataset_tables import fetch_dataset_rows_page

    async def _call() -> None:
        await fetch_dataset_rows_page(None, "d1", after="2026-01-31")  # type: ignore[arg-type]

    with pytest.raises(ValueError, match="requires `sort`"):
        asyncio.run(_call())
