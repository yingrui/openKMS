"""API schemas for connectors."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ConnectorKindInputFieldOut(BaseModel):
    key: str
    label: str
    field_type: str
    required: bool = True
    default: str | None = None
    placeholder: str | None = None


class ConnectorKindOutputSlotOut(BaseModel):
    slot: str
    label: str
    description: str
    resource: str


class ConnectorKindOut(BaseModel):
    kind: str
    label: str
    description: str
    secret_keys: list[str] = Field(
        default_factory=list,
        description="Logical secret field names for this kind (values stored encrypted server-side).",
    )
    input_fields: list[ConnectorKindInputFieldOut] = Field(default_factory=list)
    output_slots: list[ConnectorKindOutputSlotOut] = Field(default_factory=list)


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
