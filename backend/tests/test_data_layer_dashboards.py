"""Dashboard report runs: which engine a report goes to, and what one needs to be runnable."""

from __future__ import annotations

import pytest

from app.services.data_layer.dashboards import (
    SOURCE_DATASET,
    SOURCE_SEMANTIC_MODEL,
    dataset_query_kwargs,
    model_query_kwargs,
    report_source,
    source_failure,
)
from app.services.data_layer.query import QueryError


def test_a_dataset_report_needs_a_dataset():
    assert source_failure(report_source({"dataset_id": "d1"})) is None
    failure = source_failure(report_source({"dataset_id": None}))
    assert failure is not None
    assert failure.code == "REPORT_SOURCE_MISSING"
    assert failure.kind == "request"
    assert failure.params == {"source": "dataset"}


def test_a_model_report_needs_a_model_and_names_it_in_the_message():
    assert source_failure(report_source({"source_kind": SOURCE_SEMANTIC_MODEL, "semantic_model_id": "m1"})) is None
    failure = source_failure(report_source({"source_kind": SOURCE_SEMANTIC_MODEL}))
    assert failure is not None
    assert failure.params == {"source": "model"}
    assert "model" in failure.detail  # the missing column, for the details line


def test_dataset_reports_carry_the_rows_query():
    assert dataset_query_kwargs(None) == {
        "filters": [],
        "sort": None,
        "order": "asc",
        "after": None,
        "limit": 100,
        "offset": 0,
    }
    kwargs = dataset_query_kwargs({"filters": [{"field": "close", "op": ">", "value": 100}], "limit": 5})
    assert kwargs["filters"] == [{"field": "close", "op": ">", "value": 100}]
    assert kwargs["limit"] == 5


def test_model_reports_carry_the_model_query():
    assert model_query_kwargs({"metric": "市盈率"}) == {
        "metric": "市盈率",
        "group_by": [],
        "filters": [],
        "order_by": [],
        "limit": 100,
    }
    kwargs = model_query_kwargs(
        {"metric": "pe", "group_by": [{"field": "industry"}], "order_by": [{"field": "value"}]}
    )
    assert kwargs["group_by"] == [{"field": "industry"}]
    assert kwargs["order_by"] == [{"field": "value"}]


def test_a_dataset_block_is_a_summary_when_it_carries_aggregates():
    from app.services.data_layer.dashboards import dataset_summary_kwargs, is_summary_query

    assert is_summary_query({"filters": [{"field": "close", "op": ">"}]}) is False
    assert is_summary_query({"aggregates": [{"fn": "count"}]}) is True
    assert dataset_summary_kwargs({"group_by": ["industry"], "aggregates": [{"fn": "count"}], "limit": 5}) == {
        "group_by": ["industry"],
        "aggregates": [{"fn": "count"}],
        "filters": [],
        "order_by": [],
        "limit": 5,
        "offset": 0,
    }


def test_a_model_block_without_a_metric_is_a_request_failure():
    with pytest.raises(QueryError) as excinfo:
        model_query_kwargs({"group_by": [{"field": "industry"}]})
    assert excinfo.value.code == "REPORT_METRIC_MISSING"
    assert excinfo.value.kind == "request"


def test_a_report_reads_exactly_one_source():
    """A report is model-backed or dataset-backed; a `source_kind` we do not know is refused."""
    model = report_source({"source_kind": SOURCE_SEMANTIC_MODEL, "semantic_model_id": "m1", "dataset_id": "d1"})
    assert (model.kind, model.resource_id, model.dataset_id) == (SOURCE_SEMANTIC_MODEL, "m1", None)
    default = report_source({"dataset_id": "d1", "semantic_model_id": "m1"})
    assert (default.kind, default.resource_id) == (SOURCE_DATASET, "d1")
    with pytest.raises(QueryError) as excinfo:
        report_source({"source_kind": "spreadsheet"})
    assert excinfo.value.failure.code == "REPORT_SOURCE_KIND_UNKNOWN"
    # A forbidden source is a `request` failure that names what was out of reach, never a row.
    from app.services.data_layer.dashboards import source_forbidden

    assert source_forbidden(default).code == "REPORT_SOURCE_FORBIDDEN"
