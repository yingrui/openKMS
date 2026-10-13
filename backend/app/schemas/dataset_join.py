"""Dataset relationship schemas (Ossie foreign keys: `from` many → `to` one)."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class DatasetJoinCreate(BaseModel):
    name: str | None = None
    from_dataset_id: str
    to_dataset_id: str
    from_columns: list[str] = Field(min_length=1)
    to_columns: list[str] = Field(min_length=1)
    required: bool = False
    ai_context: dict[str, Any] | None = None
    description: str | None = None


class DatasetJoinUpdate(BaseModel):
    name: str | None = None
    from_columns: list[str] | None = None
    to_columns: list[str] | None = None
    required: bool | None = None
    ai_context: dict[str, Any] | None = None
    description: str | None = None


class DatasetJoinResponse(BaseModel):
    id: str
    name: str | None = None
    from_dataset_id: str
    from_dataset_name: str | None = None
    to_dataset_id: str
    to_dataset_name: str | None = None
    from_columns: list[str]
    to_columns: list[str]
    required: bool
    ai_context: dict[str, Any] | None = None
    description: str | None = None
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime


class DatasetJoinListResponse(BaseModel):
    items: list[DatasetJoinResponse]
    total: int
