"""Run an Explorer report's blocks against its source — where the two query engines meet.

A report binds to a **dataset** (the physical table, queried through `query_dataset_rows`) or a
**semantic model** (fields + metrics, queried through `run_query`). Both engines already exist, are
read-only, capped and classified; this module only decides which one a block goes to and turns a
stored block query into that engine's arguments.
"""

from __future__ import annotations

from typing import Any

from app.services.data_layer.query import QueryError
from app.services.data_layer.query_errors import REQUEST, QueryFailure

SOURCE_DATASET = "dataset"
SOURCE_SEMANTIC_MODEL = "semantic_model"
SOURCE_KINDS = (SOURCE_DATASET, SOURCE_SEMANTIC_MODEL)


def source_failure(
    source_kind: str | None,
    dataset_id: str | None,
    semantic_model_id: str | None,
) -> QueryFailure | None:
    """What is wrong with the report's source, or None when it can be run (kind=`request`)."""
    wants_model = source_kind == SOURCE_SEMANTIC_MODEL
    chosen = semantic_model_id if wants_model else dataset_id
    if chosen:
        return None
    return QueryFailure(
        "EXPLORER_SOURCE_MISSING",
        REQUEST,
        "semantic_model_id" if wants_model else "dataset_id",
        params={"source": "model" if wants_model else "dataset"},
    )


def dataset_query_kwargs(query: dict[str, Any] | None) -> dict[str, Any]:
    """A dataset block's stored query → `query_dataset_rows` arguments."""
    q = query or {}
    return {
        "filters": q.get("filters") or [],
        "sort": q.get("sort"),
        "order": q.get("order") or "asc",
        "after": q.get("after"),
        "limit": q.get("limit") or 100,
        "offset": q.get("offset") or 0,
    }


def model_query_kwargs(query: dict[str, Any] | None) -> dict[str, Any]:
    """A model block's stored query → `run_query` arguments (a metric is required)."""
    q = query or {}
    metric = q.get("metric")
    if not isinstance(metric, str) or not metric:
        raise QueryError(
            "A semantic-model block needs a metric.",
            QueryFailure("EXPLORER_BLOCK_METRIC_MISSING", REQUEST, "no metric"),
        )
    return {
        "metric": metric,
        "group_by": q.get("group_by") or [],
        "filters": q.get("filters") or [],
        "order_by": q.get("order_by") or [],
        "limit": q.get("limit") or 100,
    }
