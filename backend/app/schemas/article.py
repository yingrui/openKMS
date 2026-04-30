"""Article API schemas."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator


class ArticleCreate(BaseModel):
    channel_id: str
    name: str = Field(..., min_length=1, max_length=512)
    slug: str | None = Field(default=None, max_length=256)
    markdown: str | None = None
    metadata: dict[str, Any] | None = None
    series_id: str | None = None
    effective_from: datetime | None = None
    effective_to: datetime | None = None
    lifecycle_status: str | None = None
    origin_article_id: str | None = Field(default=None, max_length=512)


class ArticleUpdate(BaseModel):
    channel_id: str | None = None
    name: str | None = Field(default=None, min_length=1, max_length=512)
    slug: str | None = Field(default=None, max_length=256)
    metadata: dict[str, Any] | None = None
    series_id: str | None = None
    effective_from: datetime | None = None
    effective_to: datetime | None = None
    lifecycle_status: str | None = None
    origin_article_id: str | None = Field(default=None, max_length=512)
    last_synced_at: datetime | None = None


class ArticleMarkdownBody(BaseModel):
    markdown: str | None = None


class ArticleLifecycleUpdateBody(BaseModel):
    series_id: str | None = None
    effective_from: datetime | None = None
    effective_to: datetime | None = None
    lifecycle_status: str | None = None


class ArticleResponse(BaseModel):
    id: str
    channel_id: str
    name: str
    slug: str | None = None
    markdown: str | None = None
    metadata: dict[str, Any] | None = None
    series_id: str
    effective_from: datetime | None = None
    effective_to: datetime | None = None
    lifecycle_status: str | None = None
    is_current_for_rag: bool = True
    origin_article_id: str | None = None
    last_synced_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _map_metadata(cls, data: Any) -> Any:
        if hasattr(data, "article_metadata"):
            from app.services.article_lifecycle import article_effective_for_rag

            return {
                "id": data.id,
                "channel_id": data.channel_id,
                "name": data.name,
                "slug": data.slug,
                "markdown": data.markdown,
                "metadata": data.article_metadata,
                "series_id": data.series_id,
                "effective_from": data.effective_from,
                "effective_to": data.effective_to,
                "lifecycle_status": data.lifecycle_status,
                "is_current_for_rag": article_effective_for_rag(data),
                "origin_article_id": data.origin_article_id,
                "last_synced_at": data.last_synced_at,
                "created_at": data.created_at,
                "updated_at": data.updated_at,
            }
        return data


class ArticleListResponse(BaseModel):
    items: list[ArticleResponse]
    total: int


class ArticleAttachmentOut(BaseModel):
    id: str
    article_id: str
    storage_path: str
    original_filename: str
    size_bytes: int
    content_type: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ArticleVersionCreateBody(BaseModel):
    tag: str | None = Field(default=None, max_length=512)
    note: str | None = None


class ArticleVersionRestoreBody(BaseModel):
    save_current_as_version: bool = False
    tag: str | None = Field(default=None, max_length=512)
    note: str | None = None


class ArticleVersionListItem(BaseModel):
    id: str
    article_id: str
    version_number: int
    tag: str | None = None
    note: str | None = None
    created_at: datetime
    created_by_sub: str | None = None
    created_by_name: str | None = None

    model_config = {"from_attributes": True}


class ArticleVersionListResponse(BaseModel):
    items: list[ArticleVersionListItem]


class ArticleVersionDetailResponse(BaseModel):
    id: str
    article_id: str
    version_number: int
    tag: str | None = None
    note: str | None = None
    markdown: str | None = None
    metadata: dict[str, Any] | None = None
    created_at: datetime
    created_by_sub: str | None = None
    created_by_name: str | None = None

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _map_version_metadata(cls, data: Any) -> Any:
        if hasattr(data, "version_metadata"):
            return {
                "id": data.id,
                "article_id": data.article_id,
                "version_number": data.version_number,
                "tag": data.tag,
                "note": data.note,
                "markdown": data.markdown,
                "metadata": data.version_metadata,
                "created_at": data.created_at,
                "created_by_sub": data.created_by_sub,
                "created_by_name": data.created_by_name,
            }
        return data
