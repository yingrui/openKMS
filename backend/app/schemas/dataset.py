"""Dataset schemas."""
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, model_validator

from app.constants import DEFAULT_PAGE_SIZE


class DatasetCreate(BaseModel):
    """A table dataset names its table; a file dataset only names itself (`kind="file"`)."""

    kind: str = "table"
    data_source_id: str | None = None
    schema_name: str | None = None
    table_name: str | None = None
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
    #: table = a table in a SQL source; file = immutable numbered versions of files.
    kind: str = "table"
    schema_name: str | None = None
    table_name: str | None = None
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


class DatasetFacet(BaseModel):
    """One filter value and how many readable datasets carry it."""

    value: str
    count: int


class DatasetFacetsResponse(BaseModel):
    """The values worth filtering a catalog by, with counts — a facet count says where things are."""

    domains: list[DatasetFacet]
    tags: list[DatasetFacet]
    sources: list[DatasetFacet]


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
    description: str | None = None


class ColumnDescriptionUpdate(BaseModel):
    description: str | None = None


class DatasetRowFilter(BaseModel):
    """One grid filter: a table column, a whitelisted operator, a value."""

    field: str
    op: str
    value: Any = None


class DatasetRowsQuery(BaseModel):
    """A browse of a dataset table: AND-ed filters, a sort, and offset or keyset paging."""

    filters: list[DatasetRowFilter] = []
    sort: str | None = None
    order: str = "asc"
    limit: int = DEFAULT_PAGE_SIZE
    offset: int = 0
    after: str | None = None


class DatasetGroupBy(BaseModel):
    """One group column, optionally truncated to a grain (a temporal column only)."""

    column: str
    granularity: str | None = None


class DatasetAggregate(BaseModel):
    """One output of a dataset summary: `fn` over `column` (none = `COUNT(*)`)."""

    fn: str
    column: str | None = None
    name: str | None = None


class DatasetRowOrder(BaseModel):
    """Order a summary by a group-by column or an aggregate's name."""

    field: str
    direction: str = "asc"


class DatasetSummaryQuery(BaseModel):
    """Summarise a dataset table: group-by columns + aggregates, over the grid's filters."""

    #: A bare column name, or `{column, granularity}` to group a date column by a grain.
    group_by: list[str | DatasetGroupBy] = []
    aggregates: list[DatasetAggregate] = []
    filters: list[DatasetRowFilter] = []
    order_by: list[DatasetRowOrder] = []
    limit: int = DEFAULT_PAGE_SIZE
    offset: int = 0


class DatasetSummaryResponse(BaseModel):
    """A summary answer — the model query's shape, so callers treat both alike."""

    sql: str
    columns: list[str] = []
    rows: list[dict] = []
    row_count: int = 0
    capped: bool = False
    duration_ms: int = 0


class DatasetRowsResponse(BaseModel):
    """Paginated rows from a dataset table.

    ``columns`` always describes the table (so an empty, filtered-out result still renders a header)
    and ``total`` counts the rows the filters match.
    """

    columns: list[str] = []
    rows: list[dict]
    total: int
    limit: int
    offset: int
    next_after: str | None = None
    capped: bool = False


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


class FileDatasetCreate(BaseModel):
    """A file dataset: a catalog entry for immutable, versioned files."""

    display_name: str
    description: str | None = None
    domain: str | None = None
    tags: list[str] | None = None


class DatasetVersionCreate(BaseModel):
    notes: str | None = None
    #: Carry over a previous version's files without copying them (default: none).
    from_version: int | None = None


class DatasetVersionResponse(BaseModel):
    dataset_id: str
    version: int
    notes: str | None = None
    status: str
    columns: list[dict[str, Any]] = []
    file_count: int = 0
    row_count: int = 0
    byte_size: int = 0
    date_from: date | None = None
    date_to: date | None = None
    published_at: datetime | None = None
    created_by_name: str | None = None
    created_at: datetime
    manifest_key: str | None = None
    #: Which recorded column the date range came from — **guessed** by name at upload, so the range is a note
    #: about the files, not a field of the version. Null means there is no date range to speak of.
    date_column: str | None = None

    @model_validator(mode="after")
    def _date_column(self) -> "DatasetVersionResponse":
        names = {c.get("name") for c in self.columns or []}
        self.date_column = next(
            (c for c in ("trade_date", "date", "dt", "as_of_date", "asof", "timestamp") if c in names),
            None,
        )
        return self

    model_config = {"from_attributes": True}


class DatasetVersionFileResponse(BaseModel):
    name: str
    storage_key: str
    sha256: str
    rows: int
    bytes: int = 0
    date_from: date | None = None
    date_to: date | None = None
    reused_from_version: int | None = None
    created_by: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DatasetVersionDetailResponse(DatasetVersionResponse):
    files: list[DatasetVersionFileResponse] = []


class FileRowsResponse(BaseModel):
    """Rows selected out of a published version — column and row selection, never a join."""

    version: int
    columns: list[str] = []
    rows: list[dict[str, Any]] = []
    total_scanned: int = 0
