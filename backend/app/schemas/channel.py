"""Channel schemas."""
from typing import Any

from pydantic import BaseModel


class ExtractionSchemaField(BaseModel):
    """Single field in extraction schema."""

    key: str
    label: str
    type: str  # "string" | "date" | "array"


class LabelConfigItem(BaseModel):
    """Single label config: maps a label key to an object type."""

    key: str
    object_type_id: str
    display_label: str | None = None
    allow_multiple: bool = False


class ChannelNode(BaseModel):
    id: str
    name: str
    description: str | None = None
    sort_order: int = 0
    pipeline_id: str | None = None
    auto_process: bool = False
    extraction_model_id: str | None = None
    extraction_schema: dict[str, Any] | list[dict[str, Any]] | None = None
    label_config: list[dict[str, Any]] | None = None
    children: list["ChannelNode"] = []

    model_config = {"from_attributes": True}

ChannelNode.model_rebuild()


class ChannelCreate(BaseModel):
    name: str
    description: str | None = None
    parent_id: str | None = None
    sort_order: int = 0


class ChannelMergeBody(BaseModel):
    source_channel_id: str
    target_channel_id: str
    include_descendants: bool = True


class ChannelReorderBody(BaseModel):
    direction: str  # "up" | "down"


class ChannelUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    parent_id: str | None = None
    pipeline_id: str | None = None
    auto_process: bool | None = None
    extraction_model_id: str | None = None
    extraction_schema: dict[str, Any] | list[dict[str, Any]] | None = None
    label_config: list[dict[str, Any]] | None = None
    sort_order: int | None = None
