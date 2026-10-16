"""Run a dashboard's reports against their sources — where the two query engines meet.

A **dashboard** is the document (a question, a narrative, the reports in it); each **report** in it
owns its source — a **dataset** (the physical table, queried through `query_dataset_rows`) or a
**semantic model** (fields + metrics, queried through `run_query`) — and the query it came from. So
one dashboard can mix sources, and this module decides which engine each report goes to and turns a
stored report query into that engine's arguments.
"""

from __future__ import annotations

from typing import Any, NamedTuple

from app.services.data_layer.query import QueryError
from app.services.data_layer.query_errors import REQUEST, QueryFailure

SOURCE_DATASET = "dataset"
SOURCE_SEMANTIC_MODEL = "semantic_model"
SOURCE_KINDS = (SOURCE_DATASET, SOURCE_SEMANTIC_MODEL)


class ReportSource(NamedTuple):
    """The source one report reads: its kind plus the id that applies to that kind."""

    kind: str
    dataset_id: str | None
    semantic_model_id: str | None

    @property
    def resource_id(self) -> str | None:
        return self.semantic_model_id if self.kind == SOURCE_SEMANTIC_MODEL else self.dataset_id


def report_source(report: dict[str, Any] | None) -> ReportSource:
    """A stored report's source. A report is either model-backed or dataset-backed, never both."""
    entry = report or {}
    kind = entry.get("source_kind")
    if kind == SOURCE_SEMANTIC_MODEL:
        return ReportSource(SOURCE_SEMANTIC_MODEL, None, entry.get("semantic_model_id"))
    if kind not in (None, SOURCE_DATASET):
        raise QueryError(
            "A report's source is a dataset or a semantic model.",
            QueryFailure(
                "EXPLORER_SOURCE_KIND_UNKNOWN", REQUEST, str(kind), params={"kind": str(kind)}
            ),
        )
    return ReportSource(SOURCE_DATASET, entry.get("dataset_id"), None)


def source_failure(source: ReportSource) -> QueryFailure | None:
    """What is wrong with a report's source, or None when it can be run (kind=`request`)."""
    if source.resource_id:
        return None
    wants_model = source.kind == SOURCE_SEMANTIC_MODEL
    return QueryFailure(
        "EXPLORER_SOURCE_MISSING",
        REQUEST,
        "semantic_model_id" if wants_model else "dataset_id",
        params={"source": "model" if wants_model else "dataset"},
    )


def source_forbidden(source: ReportSource) -> QueryFailure:
    """The report reads a source this caller may not: say so without leaking a row."""
    return QueryFailure(
        "EXPLORER_SOURCE_FORBIDDEN",
        REQUEST,
        "semantic_model_id" if source.kind == SOURCE_SEMANTIC_MODEL else "dataset_id",
        params={"source": "model" if source.kind == SOURCE_SEMANTIC_MODEL else "dataset"},
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


def dataset_summary_kwargs(query: dict[str, Any] | None) -> dict[str, Any]:
    """A dataset block's stored query → `query_dataset_summary` arguments.

    A block is a **summary** when it carries `aggregates`; otherwise it is a row browse. The reader
    validates the columns, aggregates and filters (the same rules the grid and the API apply).
    """
    q = query or {}
    return {
        "group_by": q.get("group_by") or [],
        "aggregates": q.get("aggregates") or [],
        "filters": q.get("filters") or [],
        "order_by": q.get("order_by") or [],
        "limit": q.get("limit") or 100,
        "offset": q.get("offset") or 0,
    }


def is_summary_query(query: dict[str, Any] | None) -> bool:
    """Whether a dataset block asks for a summary rather than a page of rows."""
    return bool((query or {}).get("aggregates"))


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
