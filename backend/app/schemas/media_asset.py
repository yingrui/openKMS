"""Media asset schemas."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


MediaKind = Literal["image", "video", "audio"]
# Zhipu only generates stills and clips; audio assets are upload-only.
GeneratableMediaKind = Literal["image", "video"]
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
    transcript: dict[str, Any] | None = None
    summary: str | None = None
    keyframes: list[dict[str, Any]] | None = None
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
    summary: str | None = None
    captured_at: datetime | None = None
    location: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None
    channel_id: str | None = None
    lifecycle_status: str | None = None
    effective_from: datetime | None = None
    effective_to: datetime | None = None


class MediaGenerateRequest(BaseModel):
    channel_id: str
    media_kind: GeneratableMediaKind
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


class MediaAnalyzeRequest(BaseModel):
    """Options for deriving transcript / keyframes / summary from one asset."""

    model_id: str | None = Field(
        default=None, description="Chat model for the executive summary; omit to skip summarizing"
    )
    language: str | None = Field(default=None, description="Force ASR language, e.g. 'zh'; omit to auto-detect")
    keyframe_count: int = Field(default=6, ge=1, le=24)
    glossary_id: str | None = Field(
        default=None,
        description="Glossary whose synonyms repair the transcript; omit to skip correction",
    )
    use_hotwords: bool = Field(
        default=False,
        description=(
            "Also bias the decoder with glossary terms. Off by default: measured on this corpus, "
            "hotwords made the decoder skip whole passages (94.8% -> 84.5% coverage) for a few "
            "term fixes that post-correction already handles."
        ),
    )


class MediaAnalyzeResponse(BaseModel):
    job_id: int


class ExtractMediaMetadataResponse(BaseModel):
    """结构化元数据提取结果(与文档 ExtractMetadataResponse 对齐)。"""

    asset: MediaAssetResponse
    warnings: list[str] = []
