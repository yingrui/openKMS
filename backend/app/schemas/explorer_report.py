"""Explorer report schemas."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ExplorerReportCreate(BaseModel):
    name: str
    question: str | None = None
    #: `dataset` (a physical table) or `semantic_model` (fields + metrics).
    source_kind: str = "dataset"
    dataset_id: str | None = None
    semantic_model_id: str | None = None
    status: str = "draft"
    narrative: str | None = None
    blocks: list[dict[str, Any]] | None = None


class ExplorerReportUpdate(BaseModel):
    name: str | None = None
    question: str | None = None
    source_kind: str | None = None
    dataset_id: str | None = None
    semantic_model_id: str | None = None
    status: str | None = None
    narrative: str | None = None
    blocks: list[dict[str, Any]] | None = None


class ExplorerReportResponse(BaseModel):
    id: str
    name: str
    question: str | None = None
    source_kind: str = "dataset"
    dataset_id: str | None = None
    semantic_model_id: str | None = None
    status: str
    narrative: str | None = None
    blocks: list[dict[str, Any]] | None = None
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime


class ExplorerReportListResponse(BaseModel):
    items: list[ExplorerReportResponse]
    total: int
