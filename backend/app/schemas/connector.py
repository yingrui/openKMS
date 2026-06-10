"""API schemas for connectors."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


class ConnectorKindInputFieldOut(BaseModel):
    key: str
    label: str
    field_type: str
    required: bool = True
    default: str | None = None
    placeholder: str | None = None
    options: list[str] = Field(default_factory=list)


class ConnectorDatasetColumnOut(BaseModel):
    name: str
    pg_type: str
    nullable: bool = False
    primary_key: bool = False


class ConnectorKindOutputSlotOut(BaseModel):
    slot: str
    label: str
    description: str
    resource: str
    dataset_schema: list[ConnectorDatasetColumnOut] = Field(default_factory=list)
    default_pg_schema: str | None = None
    default_table_name: str | None = None


class ConnectorProvisionDatasetRequest(BaseModel):
    kind: str = Field(..., min_length=1, max_length=64)
    slot: str = Field(..., min_length=1, max_length=64)
    data_source_id: str = Field(..., min_length=1, max_length=64)
    schema_name: str | None = Field(None, max_length=128)
    table_name: str | None = Field(None, max_length=256)
    display_name: str | None = Field(None, max_length=256)


class ConnectorProvisionDatasetResponse(BaseModel):
    id: str
    data_source_id: str
    data_source_name: str | None = None
    schema_name: str
    table_name: str
    display_name: str | None = None


class ConnectorKindOut(BaseModel):
    kind: str
    category: str = Field(description="sync | search_tool")
    label: str
    description: str
    secret_keys: list[str] = Field(
        default_factory=list,
        description="Logical secret field names for this kind (values stored encrypted server-side).",
    )
    input_fields: list[ConnectorKindInputFieldOut] = Field(default_factory=list)
    output_slots: list[ConnectorKindOutputSlotOut] = Field(default_factory=list)
    output_schema: dict[str, Any] | None = Field(
        default=None,
        description="JSON Schema for search_tool response shape (kind metadata; not stored per instance).",
    )
    default_settings: dict[str, Any] | None = Field(
        default=None,
        description="Default extra settings merged on create (e.g. web_search_url for Zhipu).",
    )


class ConnectorSyncTriggerRequest(BaseModel):
    start_date: date | None = Field(
        default=None,
        description="Inclusive sync start (YYYY-MM-DD). Required together with end_date for manual sync.",
    )
    end_date: date | None = Field(
        default=None,
        description="Inclusive sync end (YYYY-MM-DD). Omit both dates so the connector kind picks its default window.",
    )


class ConnectorSyncTriggerResponse(BaseModel):
    job_id: int


class ConnectorSyncScheduleOut(BaseModel):
    enabled: bool = False
    cron: str | None = None
    timezone: str = "UTC"
    next_run_at: datetime | None = None


class ConnectorSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    params: dict[str, Any] | None = Field(
        default=None,
        description="One-shot overrides for connector inputs (playground; not persisted).",
    )


class ConnectorSearchDebugOut(BaseModel):
    method: str = "POST"
    endpoint: str
    request_body: dict[str, Any] = Field(default_factory=dict)
    status_code: int | None = None
    provider_response: dict[str, Any] | None = None


class ConnectorSearchResponse(BaseModel):
    query: str
    provider: dict[str, Any] | None = None
    search_intent: list[dict[str, Any]] = Field(default_factory=list)
    results: list[dict[str, Any]] = Field(default_factory=list)
    debug: ConnectorSearchDebugOut | None = None


class ConnectorCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    kind: str = Field(..., min_length=1, max_length=64)
    inputs: dict[str, Any] | None = None
    outputs: dict[str, Any] | None = None
    settings: dict[str, Any] | None = None
    secrets: dict[str, str] | None = None
    enabled: bool = True


class ConnectorUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=256)
    inputs: dict[str, Any] | None = None
    outputs: dict[str, Any] | None = None
    settings: dict[str, Any] | None = None
    secrets: dict[str, str] | None = None
    enabled: bool | None = None


class ConnectorResponse(BaseModel):
    id: str
    name: str
    kind: str
    inputs: dict[str, Any] | None = None
    outputs: dict[str, Any] | None = None
    settings: dict[str, Any] | None = None
    sync_schedule: ConnectorSyncScheduleOut | None = None
    enabled: bool
    secrets_configured: dict[str, bool] = Field(
        default_factory=dict,
        description="Per secret key: whether a non-empty value is stored (never returns values).",
    )
    created_at: datetime
    updated_at: datetime


class ConnectorListResponse(BaseModel):
    items: list[ConnectorResponse]
    total: int
