"""The WHERE clause behind reading a table *as object instances*.

It has to push filters and search into SQL: the object list used to filter one page in memory, so
`total` described the whole table while the page described a subset of one page — wrong counts and
missing rows on every filtered/paged request.
"""

from __future__ import annotations

import pytest

from app.services.ontology.dataset_tables import dataset_row_where


def test_no_filters_no_predicate():
    assert dataset_row_where(columns=["a", "b"]) == ("", {})


def test_equality_filters_are_parameters_and_cast_to_text():
    sql, params = dataset_row_where(columns=[], filters={"status": "done"})
    assert sql == 'CAST("status" AS TEXT) = :filter_0'
    assert params == {"filter_0": "done"}
    # A query-string value must also match a numeric/date column.
    assert "CAST(" in sql


def test_several_filters_combine_with_and():
    sql, params = dataset_row_where(columns=[], filters={"a": "1", "b": "2"})
    assert sql == 'CAST("a" AS TEXT) = :filter_0 AND CAST("b" AS TEXT) = :filter_1'
    assert params == {"filter_0": "1", "filter_1": "2"}


def test_search_spans_the_live_columns():
    sql, params = dataset_row_where(columns=["title", "status"], search="weekly")
    assert 'CAST("title" AS TEXT) ILIKE :search' in sql
    assert 'CAST("status" AS TEXT) ILIKE :search' in sql
    assert sql.startswith("(") and sql.endswith(")")
    assert params == {"search": "%weekly%"}


def test_search_without_columns_degrades_to_no_predicate():
    """A table with no readable column list cannot be searched, but must not error out."""
    assert dataset_row_where(columns=[], search="weekly") == ("", {})
    assert dataset_row_where(columns=[], search="   ") == ("", {})


def test_not_null_marks_the_rows_that_are_links():
    sql, params = dataset_row_where(columns=[], not_null=["product_code"])
    assert sql == '"product_code" IS NOT NULL'
    assert params == {}


def test_filters_and_not_null_and_search_combine():
    sql, params = dataset_row_where(
        columns=["code"], filters={"status": "live"}, search="x", not_null=["product_code"]
    )
    assert sql == (
        '"product_code" IS NOT NULL AND CAST("status" AS TEXT) = :filter_0 '
        'AND (CAST("code" AS TEXT) ILIKE :search)'
    )
    assert params == {"filter_0": "live", "search": "%x%"}


@pytest.mark.parametrize("column", ['bad"name', "status;drop table x", "a b", ""])
def test_unsafe_filter_column_is_rejected(column: str):
    with pytest.raises(ValueError, match="Invalid property filter column"):
        dataset_row_where(columns=[], filters={column: "x"})


def test_unsafe_not_null_column_is_rejected():
    with pytest.raises(ValueError, match="Invalid required column"):
        dataset_row_where(columns=[], not_null=['x" ; DROP TABLE datasets; --'])
