"""Media asset schemas."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


MediaKind = Literal["image", "video"]
ProvenanceKind = Literal["uploaded", "generated"]


class MediaAssetResponse(BaseModel):
    id: str
    channel_id: str
    media_kind: str
    title: str
    description: str | None = None
    captured_at: datetime | None = None
    location: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = Field(default=None, validation_alias="asset_metadata")
    storage_key: str
    thumbnail_key: str | None = None
    poster_key: str | None = None
    content_type: str | None = None
    width: int | None = None
    height: int | None = None
    duration_ms: int | None = None
    provenance: str
    generation: dict[str, Any] | None = None
    series_id: str
    effective_from: datetime | None = None
    effective_to: datetime | None = None
    lifecycle_status: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class MediaAssetListResponse(BaseModel):
    items: list[MediaAssetResponse]
    total: int


class MediaAssetUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=512)
    description: str | None = None
    captured_at: datetime | None = None
    location: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None
    channel_id: str | None = None
    lifecycle_status: str | None = None
    effective_from: datetime | None = None
    effective_to: datetime | None = None


class MediaGenerateRequest(BaseModel):
    channel_id: str
    media_kind: MediaKind
    model_id: str
    prompt: str = Field(default="", max_length=512)
    title: str | None = Field(default=None, max_length=512)
    size: str | None = None
    quality: str | None = None
    duration: int | None = None
    fps: int | None = None
    with_audio: bool | None = None
    image_url: str | None = None
    params: dict[str, Any] | None = None

    @model_validator(mode="after")
    def check_prompt_or_image(self) -> "MediaGenerateRequest":
        if not self.prompt.strip() and not self.image_url:
            raise ValueError("Either prompt or image_url must be provided")
        return self


class MediaGenerateResponse(BaseModel):
    job_id: int
    provider_task_id: str
