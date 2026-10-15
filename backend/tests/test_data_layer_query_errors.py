"""Query failures are classified: the Playground must say *who* can fix a failed question."""

from __future__ import annotations

import pytest

from app.services.data_layer.query import QueryError, _order_sql
from app.services.data_layer.query_errors import (
    DATA,
    DEFINITION,
    REQUEST,
    classify_sql_error,
    sqlstate_of,
)


class _DriverError(Exception):
    """Stands in for a psycopg error: SQLAlchemy exposes it as `DBAPIError.orig`."""

    def __init__(self, sqlstate: str | None, message: str = "boom") -> None:
        super().__init__(message)
        if sqlstate is not None:
            self.sqlstate = sqlstate


class _Wrapped(Exception):
    def __init__(self, orig: _DriverError) -> None:
        super().__init__(f"(psycopg) {orig}")
        self.orig = orig


def _wrapped(sqlstate: str | None) -> _Wrapped:
    return _Wrapped(_DriverError(sqlstate))


def test_sqlstate_is_read_through_sqlalchemy_wrapping():
    assert sqlstate_of(_wrapped("42803")) == "42803"
    assert sqlstate_of(_DriverError(None)) is None


def test_non_aggregate_expression_is_a_definition_problem():
    failure = classify_sql_error(_wrapped("42803"))
    assert (failure.code, failure.kind) == ("QUERY_METRIC_NOT_AGGREGATE", DEFINITION)
    assert failure.detail  # the source's own words, for the details line


def test_missing_column_points_at_the_model_fields():
    assert classify_sql_error(_wrapped("42703")).code == "QUERY_UNKNOWN_COLUMN"
    assert classify_sql_error(_wrapped("42703")).kind == DEFINITION


def test_permission_and_timeout_are_data_problems():
    permission = classify_sql_error(_wrapped("42501"))
    assert (permission.code, permission.kind) == ("QUERY_PERMISSION_DENIED", DATA)
    timeout = classify_sql_error(_wrapped("57014"))
    assert (timeout.code, timeout.kind) == ("QUERY_TIMEOUT", DATA)


def test_connection_failures_are_unreachable():
    assert classify_sql_error(_wrapped("08006")).code == "QUERY_SOURCE_UNREACHABLE"


def test_other_sql_errors_fall_back_to_definition_then_to_data():
    assert classify_sql_error(_wrapped("42000")).code == "QUERY_DEFINITION_INVALID"
    unknown = classify_sql_error(_wrapped("22012"))
    assert (unknown.code, unknown.kind) == ("QUERY_FAILED", DATA)


def test_an_error_without_a_sqlstate_is_still_classified():
    failure = classify_sql_error(RuntimeError("socket closed"))
    assert (failure.code, failure.kind) == ("QUERY_FAILED", DATA)
    assert failure.detail == "socket closed"


def test_local_validation_carries_a_request_code():
    """A caller asking for something incoherent is not a model or source problem."""
    with pytest.raises(QueryError) as excinfo:
        _order_sql("ts_code", "asc", "SUM(x)", {"area": 'base."area"'})
    assert (excinfo.value.code, excinfo.value.kind) == ("QUERY_ORDER_NOT_GROUPED", REQUEST)


def test_api_detail_is_localized_and_carries_the_kind():
    """The client branches on `kind` and shows `detail` in a collapsed line."""
    from app.api.query_errors import query_failure_detail
    from app.i18n.errors import resolve_locale
    from app.services.data_layer.query_errors import QueryFailure

    detail = query_failure_detail(
        None,  # the helper falls back to English without a request
        QueryFailure("QUERY_METRIC_NOT_AGGREGATE", DEFINITION, "column \"pe\" must appear in GROUP BY"),
    )
    assert detail["code"] == "QUERY_METRIC_NOT_AGGREGATE"
    assert detail["kind"] == "definition"
    assert "aggregate" in detail["message"]
    assert "GROUP BY" in detail["detail"]
    assert resolve_locale(None) == "en"


def test_api_detail_omits_the_source_text_when_there_is_none():
    from app.api.query_errors import query_failure_detail
    from app.services.data_layer.query_errors import QueryFailure

    detail = query_failure_detail(None, QueryFailure("QUERY_UNKNOWN_METRIC", REQUEST))
    assert detail == {
        "code": "QUERY_UNKNOWN_METRIC",
        "kind": "request",
        "message": "That metric is not part of this semantic model.",
    }
