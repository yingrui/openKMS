"""Data resource schemas (a row-scoped slice of one semantic model)."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class DataResourceCreate(BaseModel):
    name: str
    description: str | None = None
    semantic_model_id: str
    #: The table the row policy applies to; must be one of the model's datasets.
    base_dataset_id: str | None = None
    #: `[{column, op, value}]` or `[{column, op, claim}]` — ANDed into every query.
    row_policy: list[dict[str, Any]] = []


class DataResourceUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    base_dataset_id: str | None = None
    row_policy: list[dict[str, Any]] | None = None


class DataResourceResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    semantic_model_id: str
    base_dataset_id: str | None = None
    row_policy: list[dict[str, Any]] = []
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime


class DataResourceListResponse(BaseModel):
    items: list[DataResourceResponse]
    total: int
