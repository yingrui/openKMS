"""Channel schemas."""
from typing import Any

from pydantic import BaseModel


class ExtractionSchemaField(BaseModel):
    """Single field in extraction schema."""

    key: str
    label: str
    type: str  # "string" | "date" | "array"


class ChannelNode(BaseModel):
    id: str
    name: str
    description: str | None = None
    pipeline_id: str | None = None
    auto_process: bool = False
    extraction_model_id: str | None = None
    extraction_schema: list[dict[str, Any]] | None = None
    children: list["ChannelNode"] = []

    model_config = {"from_attributes": True}

ChannelNode.model_rebuild()


class ChannelCreate(BaseModel):
    name: str
    parent_id: str | None = None
    sort_order: int = 0


class ChannelUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    pipeline_id: str | None = None
    auto_process: bool | None = None
    extraction_model_id: str | None = None
    extraction_schema: list[dict[str, Any]] | None = None
    sort_order: int | None = None
