"""Quality rule + run schemas."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class QualityRuleCreate(BaseModel):
    name: str
    rule_type: str  # not_null | unique | range | referential | freshness
    column_name: str | None = None
    config: dict[str, Any] | None = None
    severity: str = "warning"
    enabled: bool = True


class QualityRuleUpdate(BaseModel):
    name: str | None = None
    column_name: str | None = None
    config: dict[str, Any] | None = None
    severity: str | None = None
    enabled: bool | None = None


class QualityRuleResponse(BaseModel):
    id: str
    dataset_id: str
    name: str
    rule_type: str
    column_name: str | None = None
    config: dict[str, Any] | None = None
    severity: str
    enabled: bool
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime
    last_status: str | None = None
    last_run_at: datetime | None = None


class QualityRunResponse(BaseModel):
    id: str
    rule_id: str
    status: str
    checked_count: int | None = None
    failed_count: int | None = None
    detail: dict[str, Any] | None = None
    error_message: str | None = None
    created_at: datetime


class QualityIssueResponse(BaseModel):
    """One rule and the latest run that judged it — the whole of what an inbox needs."""

    id: str
    dataset_id: str
    dataset_name: str
    name: str
    rule_type: str
    column_name: str | None = None
    severity: str
    status: str  # passed | failed | error | never
    checked_count: int | None = None
    failed_count: int | None = None
    detail: dict[str, Any] | None = None
    error_message: str | None = None
    last_run_at: datetime | None = None


class QualityIssueListResponse(BaseModel):
    items: list[QualityIssueResponse]
    total: int
