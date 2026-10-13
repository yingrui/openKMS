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
