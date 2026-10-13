"""Dataset schemas."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class DatasetCreate(BaseModel):
    data_source_id: str
    schema_name: str
    table_name: str
    display_name: str | None = None
    description: str | None = None
    domain: str | None = None
    tags: list[str] | None = None
    business_definition: str | None = None
    sensitivity: str | None = None
    primary_key_columns: list[str] | None = None
    unique_keys: list[list[str]] | None = None
    ai_context: dict[str, Any] | None = None
    is_editable: bool = False


class DatasetUpdate(BaseModel):
    schema_name: str | None = None
    table_name: str | None = None
    display_name: str | None = None
    description: str | None = None
    owner_sub: str | None = None
    domain: str | None = None
    tags: list[str] | None = None
    business_definition: str | None = None
    sensitivity: str | None = None
    primary_key_columns: list[str] | None = None
    unique_keys: list[list[str]] | None = None
    ai_context: dict[str, Any] | None = None
    is_editable: bool | None = None


class DatasetResponse(BaseModel):
    id: str
    data_source_id: str
    data_source_name: str | None = None
    schema_name: str
    table_name: str
    display_name: str | None = None
    description: str | None = None
    owner_sub: str | None = None
    domain: str | None = None
    tags: list[str] = []
    business_definition: str | None = None
    sensitivity: str | None = None
    primary_key_columns: list[str] | None = None
    unique_keys: list[list[str]] = []
    ai_context: dict[str, Any] | None = None
    is_editable: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DatasetListResponse(BaseModel):
    items: list[DatasetResponse]
    total: int


class TableInfo(BaseModel):
    """Schema and table name from information_schema."""
    schema_name: str
    table_name: str


class ColumnMetadata(BaseModel):
    """Column metadata from a tabular datasource.

    ``data_type`` is the source-native type (e.g. PostgreSQL ``uuid``).
    ``ontology_type`` is the canonical ontology property type produced by the
    kind-specific adapter — clients should prefer this when building schemas.
    """
    column_name: str
    data_type: str
    ontology_type: str = "string"
    is_nullable: bool = False
    ordinal_position: int = 0


class DatasetRowsResponse(BaseModel):
    """Paginated rows from a dataset table."""
    rows: list[dict]
    total: int
    limit: int
    offset: int
    next_after: str | None = None


class DatasetRowOp(BaseModel):
    """One row operation for `POST /api/datasets/{id}/rows/apply`."""

    op: str  # insert | update | delete
    pk: dict[str, Any] | None = None  # primary-key values (update/delete)
    values: dict[str, Any] | None = None  # new values (insert/update)
    expect: dict[str, Any] | None = None  # old values for optimistic concurrency (update/delete)


class DatasetRowsApplyRequest(BaseModel):
    ops: list[DatasetRowOp]
    dry_run: bool = False


class DatasetRowsApplyResponse(BaseModel):
    inserted: int = 0
    updated: int = 0
    deleted: int = 0
    dry_run: bool = False


class DatasetProfileColumn(BaseModel):
    column: str
    null_count: int | None = None
    distinct_count: int | None = None
    min: Any | None = None
    max: Any | None = None


class DatasetProfileResponse(BaseModel):
    dataset_id: str
    row_count: int | None = None
    column_stats: list[DatasetProfileColumn] = []
    computed_at: datetime | None = None


class SchemaSnapshotResponse(BaseModel):
    id: str
    dataset_id: str
    columns: list[ColumnMetadata]
    captured_at: datetime


class LineageNode(BaseModel):
    type: str
    id: str
    label: str | None = None


class LineageJoin(BaseModel):
    join_id: str
    dataset_id: str
    dataset_name: str | None = None
    join_type: str


class DatasetLineageResponse(BaseModel):
    dataset: LineageNode
    upstream: list[LineageNode] = []
    downstream: list[LineageNode] = []
    joined_datasets: list[LineageJoin] = []
