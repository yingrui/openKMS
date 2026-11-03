"""Semantic model schemas (a named scope over shared datasets)."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel



class SemanticModelDatasetRef(BaseModel):
    id: str
    name: str


class SemanticModelCreate(BaseModel):
    name: str
    description: str | None = None
    dataset_ids: list[str] = []
    ai_context: dict[str, Any] | None = None


class SemanticModelUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    dataset_ids: list[str] | None = None
    ai_context: dict[str, Any] | None = None


class SemanticModelResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    dataset_ids: list[str] = []
    datasets: list[SemanticModelDatasetRef] = []
    ai_context: dict[str, Any] | None = None
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime


class SemanticModelListResponse(BaseModel):
    items: list[SemanticModelResponse]
    total: int


class QueryGroupBy(BaseModel):
    """A field to group by, with an optional query-time grain (time dimensions)."""

    field: str
    granularity: str | None = None


class QueryFilter(BaseModel):
    """A condition on one of the model's fields."""

    field: str
    op: str
    value: Any | None = None


class QueryOrder(BaseModel):
    """Order by `value` (the metric) or by a grouped dimension."""

    field: str
    direction: str = "asc"


class QueryRequest(BaseModel):
    """One ad-hoc question of a semantic model.

    Either ``metric`` (a saved definition) or ``expression`` (one-shot aggregate fragment
    with ``base_dataset`` / optional ``joins``). ``where`` / ``having`` are boolean SQL
    fragments AND-ed into those clauses; callers never submit FROM / JOIN text.
    """

    metric: str | None = None
    expression: dict[str, Any] | str | None = None
    base_dataset: str | None = None
    joins: list[str] | None = None
    group_by: list[QueryGroupBy] = []
    filters: list[QueryFilter] = []
    where: str | None = None
    having: str | None = None
    order_by: list[QueryOrder] = []
    limit: int | None = None


class QueryResponse(BaseModel):
    sql: str
    columns: list[str] = []
    rows: list[dict[str, Any]] = []
    row_count: int = 0
    capped: bool = False
    duration_ms: int = 0
    run_id: str | None = None
