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
    semantic_model_id: str
    base_dataset_id: str
    business_definition: str | None = None
    additivity: str = "additive"
    #: period | snapshot | none — how the metric relates to time (see `services/ontology/rules/evaluator`).
    time_mode: str = "none"
    time_dimension: str | None = None
    expression: dict[str, Any]
    datatype: str | None = None
    filters: list[MetricFilter] | None = None
    joins: list[str] | None = None
    ai_context: dict[str, Any] | None = None


class MetricUpdate(BaseModel):
    name: str | None = None
    semantic_model_id: str | None = None
    base_dataset_id: str | None = None
    business_definition: str | None = None
    additivity: str | None = None
    time_mode: str | None = None
    time_dimension: str | None = None
    expression: dict[str, Any] | None = None
    datatype: str | None = None
    filters: list[MetricFilter] | None = None
    joins: list[str] | None = None
    ai_context: dict[str, Any] | None = None


class MetricAssertion(BaseModel):
    """An identity this metric takes part in — `分货额度 = 方案累计额度 ±1`, and its last verdict."""

    direction: str
    counterpart: str
    counterpart_name: str | None = None
    weight: float = 1
    tolerance: dict[str, float] | None = None
    rule_id: str | None = None
    rule_object_id: str | None = None
    health: str | None = None


class RuleRefOut(BaseModel):
    """A rule that references a metric, with the result of its last run."""

    id: str
    rule_id: str | None = None
    name: str | None = None
    last_status: str | None = None
    last_period_start: str | None = None
    last_period_end: str | None = None
    last_run_at: str | None = None
    last_reason: str | None = None


class MetricRef(BaseModel):
    """A metric this one is computed from (the expression names it)."""

    id: str
    name: str


class MetricResponse(BaseModel):
    id: str
    semantic_model_id: str
    base_dataset_id: str
    base_dataset_name: str | None = None
    name: str
    business_definition: str | None = None
    additivity: str
    time_mode: str
    time_dimension: str | None = None
    depends_on: list["MetricRef"] = []
    assertions: list[MetricAssertion] = []
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
    sql: str | None = None


class MetricRunResponse(BaseModel):
    id: str
    metric_id: str
    status: str
    row_count: int
    duration_ms: int
    error: str | None = None
    ran_by_name: str | None = None
    created_at: datetime
