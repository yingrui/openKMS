"""Dataset join schemas."""
from datetime import datetime

from pydantic import BaseModel, Field


class DatasetJoinColumn(BaseModel):
    source: str
    target: str


class DatasetJoinCreate(BaseModel):
    name: str | None = None
    source_dataset_id: str
    target_dataset_id: str
    cardinality: str  # one-to-one | one-to-many
    join_columns: list[DatasetJoinColumn] = Field(min_length=1)
    description: str | None = None


class DatasetJoinUpdate(BaseModel):
    name: str | None = None
    cardinality: str | None = None
    join_columns: list[DatasetJoinColumn] | None = None
    description: str | None = None


class DatasetJoinResponse(BaseModel):
    id: str
    name: str | None = None
    source_dataset_id: str
    source_dataset_name: str | None = None
    target_dataset_id: str
    target_dataset_name: str | None = None
    cardinality: str
    join_columns: list[DatasetJoinColumn]
    description: str | None = None
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime


class DatasetJoinListResponse(BaseModel):
    items: list[DatasetJoinResponse]
    total: int
