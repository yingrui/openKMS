"""Media channel tree schemas."""

from typing import Any

from pydantic import BaseModel, Field


class MediaChannelNode(BaseModel):
    id: str
    name: str
    description: str | None = None
    sort_order: int = 0
    metadata_schema: list[dict[str, Any]] | None = None
    default_image_model_id: str | None = None
    default_video_model_id: str | None = None
    children: list["MediaChannelNode"] = []

    model_config = {"from_attributes": True}


MediaChannelNode.model_rebuild()


class MediaChannelTreeListResponse(BaseModel):
    items: list[MediaChannelNode]
    total: int
    limit: int
    offset: int


class MediaChannelCreate(BaseModel):
    name: str
    description: str | None = None
    parent_id: str | None = None
    sort_order: int = 0


class MediaChannelUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=256)
    description: str | None = Field(default=None, max_length=1024)
    parent_id: str | None = None
    sort_order: int | None = None
    metadata_schema: list[dict[str, Any]] | None = None
    default_image_model_id: str | None = None
    default_video_model_id: str | None = None


class MediaChannelMergeBody(BaseModel):
    source_channel_id: str
    target_channel_id: str
    include_descendants: bool = True


class MediaChannelReorderBody(BaseModel):
    direction: str
