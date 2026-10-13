"""Saved query schemas (Ossie saved_queries)."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class QueryMetric(BaseModel):
    name: str
    metric_id: str


class QueryFilter(BaseModel):
    column: str
    op: str
    value: Any | None = None


class SavedQueryCreate(BaseModel):
    name: str
    base_dataset_id: str
    description: str | None = None
    metrics: list[QueryMetric] = []
    group_by: list[str] = []
    joins: list[str] = []
    filters: list[QueryFilter] | None = None
    exports: list[str] = []
    ai_context: dict[str, Any] | None = None


class SavedQueryUpdate(BaseModel):
    name: str | None = None
    base_dataset_id: str | None = None
    description: str | None = None
    metrics: list[QueryMetric] | None = None
    group_by: list[str] | None = None
    joins: list[str] | None = None
    filters: list[QueryFilter] | None = None
    exports: list[str] | None = None
    ai_context: dict[str, Any] | None = None


class SavedQueryResponse(BaseModel):
    id: str
    base_dataset_id: str
    base_dataset_name: str | None = None
    name: str
    description: str | None = None
    metrics: list[QueryMetric] = []
    group_by: list[str] = []
    joins: list[str] = []
    filters: list[QueryFilter] | None = None
    exports: list[str] = []
    ai_context: dict[str, Any] | None = None
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime


class SavedQueryListResponse(BaseModel):
    items: list[SavedQueryResponse]
    total: int


class SavedQueryRunResponse(BaseModel):
    query_id: str
    columns: list[str] = []
    rows: list[dict[str, Any]] = []
    duration_ms: int = 0
