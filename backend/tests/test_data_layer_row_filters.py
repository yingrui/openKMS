"""Grid row filters: what the Data tab may ask for, and how it becomes SQL (pure — no DB)."""

from __future__ import annotations

import pytest

from app.services.data_layer.row_filters import (
    MAX_FILTERS,
    RowFilterError,
    build_row_where,
    parse_row_filters,
)

COLUMNS = {"ts_code", "trade_date", "close", "industry"}


def _code(**kw):
    """Run the real path (validate → build) and return the failure it raises."""
    with pytest.raises(RowFilterError) as excinfo:
        build_row_where(parse_row_filters([kw], COLUMNS))
    return excinfo.value


def test_a_valid_filter_set_survives():
    parsed = parse_row_filters(
        [
            {"field": "close", "op": ">", "value": 100},
            {"field": "industry", "op": "in", "value": ["银行", "证券"]},
            {"field": "trade_date", "op": "between", "value": ["2026-01-01", "2026-01-31"]},
            {"field": "ts_code", "op": "is_null", "value": None},
        ],
        COLUMNS,
    )
    assert [f.column for f in parsed] == ["close", "industry", "trade_date", "ts_code"]


def test_an_unknown_column_is_a_request_failure():
    failure = _code(field="nope", op="=", value=1).failure
    assert failure.code == "DATASET_ROWS_UNKNOWN_COLUMN"
    assert failure.kind == "request"
    assert failure.params == {"column": "nope"}  # the message names it


def test_an_unsupported_operator_is_a_request_failure():
    failure = _code(field="close", op="~", value=1).failure
    assert failure.code == "DATASET_ROWS_BAD_OPERATOR"
    assert failure.kind == "request"


def test_malformed_filters_are_rejected():
    assert _code(field="", op="=", value=1).failure.code == "DATASET_ROWS_INVALID_FILTER"
    assert _code(field='bad"name', op="=", value=1).failure.code == "DATASET_ROWS_UNKNOWN_COLUMN"
    # `in` needs a list; the shared builder is what refuses it
    assert _code(field="close", op="in", value="100").failure.code == "DATASET_ROWS_INVALID_FILTER"


def test_too_many_conditions_is_rejected():
    with pytest.raises(RowFilterError) as excinfo:
        parse_row_filters([{"field": "close", "op": ">", "value": 1}] * (MAX_FILTERS + 1), COLUMNS)
    assert excinfo.value.failure.code == "DATASET_ROWS_TOO_MANY_FILTERS"
    assert excinfo.value.failure.params == {"max": MAX_FILTERS}


def test_no_filters_means_no_where():
    assert build_row_where(parse_row_filters(None, COLUMNS)) == ([], {})


def test_values_are_parameterized_never_inlined():
    """The whole safety story for a browsing grid: the column is quoted, the value is a param."""
    where, params = build_row_where(
        parse_row_filters([{"field": "industry", "op": "=", "value": "'; DROP TABLE t; --"}], COLUMNS)
    )
    assert where == ['"industry" = :f0']
    assert params == {"f0": "'; DROP TABLE t; --"}
    assert "DROP TABLE" not in " ".join(where)


def test_a_column_that_is_not_a_valid_identifier_is_never_quoted():
    failure = _code(field="close; DROP TABLE t", op="=", value=1).failure
    assert failure.code == "DATASET_ROWS_UNKNOWN_COLUMN"
