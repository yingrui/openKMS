"""Semantic-model field schemas (model-scoped fields)."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class SemanticModelFieldCreate(BaseModel):
    dataset_id: str
    name: str
    column_name: str | None = None
    expression: dict[str, Any] | None = None
    datatype: str | None = None
    dimension: dict[str, Any] | None = None
    ai_context: dict[str, Any] | None = None
    ordinal: int | None = None


class SemanticModelFieldUpdate(BaseModel):
    name: str | None = None
    column_name: str | None = None
    expression: dict[str, Any] | None = None
    datatype: str | None = None
    dimension: dict[str, Any] | None = None
    ai_context: dict[str, Any] | None = None
    ordinal: int | None = None


class SemanticModelFieldResponse(BaseModel):
    id: str
    semantic_model_id: str
    dataset_id: str
    name: str
    column_name: str | None = None
    expression: dict[str, Any] | None = None
    datatype: str | None = None
    dimension: dict[str, Any] | None = None
    ai_context: dict[str, Any] | None = None
    ordinal: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SemanticModelFieldListResponse(BaseModel):
    items: list[SemanticModelFieldResponse]
    total: int
