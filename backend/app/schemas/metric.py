"""Metric definition + compute schemas."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class MetricFilter(BaseModel):
    column: str
    op: str
    value: Any | None = None


class MetricCreate(BaseModel):
    name: str
    business_definition: str | None = None
    aggregation: str  # count | sum | avg | min | max
    column_name: str | None = None
    filters: list[MetricFilter] | None = None
    joins: list[str] | None = None
    dimensions: list[str] | None = None


class MetricUpdate(BaseModel):
    name: str | None = None
    business_definition: str | None = None
    aggregation: str | None = None
    column_name: str | None = None
    filters: list[MetricFilter] | None = None
    joins: list[str] | None = None
    dimensions: list[str] | None = None


class MetricResponse(BaseModel):
    id: str
    dataset_id: str
    name: str
    business_definition: str | None = None
    aggregation: str
    column_name: str | None = None
    filters: list[MetricFilter] | None = None
    joins: list[str] | None = None
    dimensions: list[str] | None = None
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime


class MetricComputeResponse(BaseModel):
    metric_id: str
    rows: list[dict[str, Any]]
