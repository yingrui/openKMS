"""Explorer report runs: which engine a block goes to, and what a report needs to be runnable."""

from __future__ import annotations

import pytest

from app.services.data_layer.explorer import (
    SOURCE_DATASET,
    SOURCE_SEMANTIC_MODEL,
    dataset_query_kwargs,
    model_query_kwargs,
    source_failure,
)
from app.services.data_layer.query import QueryError


def test_a_dataset_report_needs_a_dataset():
    assert source_failure(SOURCE_DATASET, "d1", None) is None
    failure = source_failure(SOURCE_DATASET, None, None)
    assert failure is not None
    assert failure.code == "EXPLORER_SOURCE_MISSING"
    assert failure.kind == "request"
    assert failure.params == {"source": "dataset"}


def test_a_model_report_needs_a_model_and_names_it_in_the_message():
    assert source_failure(SOURCE_SEMANTIC_MODEL, "d1", "m1") is None
    failure = source_failure(SOURCE_SEMANTIC_MODEL, "d1", None)
    assert failure is not None
    assert failure.params == {"source": "model"}
    assert "model" in failure.detail  # the missing column, for the details line


def test_dataset_blocks_carry_the_rows_query():
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


def test_model_blocks_carry_the_model_query():
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


def test_a_model_block_without_a_metric_is_a_request_failure():
    with pytest.raises(QueryError) as excinfo:
        model_query_kwargs({"group_by": [{"field": "industry"}]})
    assert excinfo.value.code == "EXPLORER_BLOCK_METRIC_MISSING"
    assert excinfo.value.kind == "request"
