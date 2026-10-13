"""Dataset field schemas (Ossie semantic fields)."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class DatasetFieldCreate(BaseModel):
    name: str
    column_name: str | None = None
    expression: dict[str, Any] | None = None
    datatype: str | None = None
    dimension: dict[str, Any] | None = None
    ai_context: dict[str, Any] | None = None
    ordinal: int | None = None


class DatasetFieldUpdate(BaseModel):
    name: str | None = None
    column_name: str | None = None
    expression: dict[str, Any] | None = None
    datatype: str | None = None
    dimension: dict[str, Any] | None = None
    ai_context: dict[str, Any] | None = None
    ordinal: int | None = None


class DatasetFieldResponse(BaseModel):
    id: str
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


class DatasetFieldListResponse(BaseModel):
    items: list[DatasetFieldResponse]
    total: int
