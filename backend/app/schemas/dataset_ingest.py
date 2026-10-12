"""Dataset ingest schemas."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class DatasetIngestResponse(BaseModel):
    id: str
    data_source_id: str
    dataset_id: str | None = None
    filename: str
    status: str
    schema_name: str | None = None
    table_name: str | None = None
    row_count: int | None = None
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime


class DatasetIngestPreviewColumn(BaseModel):
    name: str
    pg_type: str
    sample_values: list[str] = []


class DatasetIngestPreviewResponse(BaseModel):
    ingest_id: str
    columns: list[DatasetIngestPreviewColumn]
    sample_rows: list[dict[str, Any]]
    warnings: list[str] = []


class DatasetIngestLoadRequest(BaseModel):
    schema_name: str
    table_name: str
    mode: str = "overwrite"  # overwrite | append
