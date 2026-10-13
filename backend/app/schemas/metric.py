"""Metric definition + compute schemas (model-level, Ossie SQL expressions)."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class MetricFilter(BaseModel):
    column: str
    op: str
    value: Any | None = None


class MetricCreate(BaseModel):
    name: str
    base_dataset_id: str
    business_definition: str | None = None
    type: str = "simple"
    expression: dict[str, Any]
    datatype: str | None = None
    filters: list[MetricFilter] | None = None
    joins: list[str] | None = None
    ai_context: dict[str, Any] | None = None


class MetricUpdate(BaseModel):
    name: str | None = None
    base_dataset_id: str | None = None
    business_definition: str | None = None
    type: str | None = None
    expression: dict[str, Any] | None = None
    datatype: str | None = None
    filters: list[MetricFilter] | None = None
    joins: list[str] | None = None
    ai_context: dict[str, Any] | None = None


class MetricResponse(BaseModel):
    id: str
    base_dataset_id: str
    base_dataset_name: str | None = None
    name: str
    business_definition: str | None = None
    type: str
    expression: dict[str, Any] | None = None
    datatype: str | None = None
    filters: list[MetricFilter] | None = None
    joins: list[str] | None = None
    ai_context: dict[str, Any] | None = None
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime


class MetricListResponse(BaseModel):
    items: list[MetricResponse]
    total: int


class MetricComputeResponse(BaseModel):
    metric_id: str
    rows: list[dict[str, Any]]
    duration_ms: int = 0


class MetricRunResponse(BaseModel):
    id: str
    metric_id: str
    status: str
    row_count: int
    duration_ms: int
    error: str | None = None
    ran_by_name: str | None = None
    created_at: datetime
