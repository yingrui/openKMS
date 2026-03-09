"""Pipeline schemas."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class PipelineCreate(BaseModel):
    name: str
    description: str | None = None
    command: str = "openkms-cli pipeline run"
    default_args: dict[str, Any] | None = None
    model_id: str | None = None


class PipelineUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    command: str | None = None
    default_args: dict[str, Any] | None = None
    model_id: str | None = None


class PipelineResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    command: str
    default_args: dict[str, Any] | None = None
    model_id: str | None = None
    model_name: str | None = None
    model_base_url: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PipelineListResponse(BaseModel):
    items: list[PipelineResponse]
    total: int
