"""Dataset schemas."""
from datetime import datetime

from pydantic import BaseModel


class DatasetCreate(BaseModel):
    data_source_id: str
    schema_name: str
    table_name: str
    display_name: str | None = None


class DatasetUpdate(BaseModel):
    schema_name: str | None = None
    table_name: str | None = None
    display_name: str | None = None


class DatasetResponse(BaseModel):
    id: str
    data_source_id: str
    data_source_name: str | None = None
    schema_name: str
    table_name: str
    display_name: str | None = None
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
    """Column metadata from information_schema.columns."""
    column_name: str
    data_type: str
    is_nullable: bool = False
    ordinal_position: int = 0


class DatasetRowsResponse(BaseModel):
    """Paginated rows from a dataset table."""
    rows: list[dict]
    total: int
    limit: int
    offset: int
