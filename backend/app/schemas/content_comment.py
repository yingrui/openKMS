"""Pydantic schemas for content comments."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class ContentCommentCreate(BaseModel):
    resource_type: str
    resource_id: str
    body: str = Field(..., min_length=1, max_length=20000)
    rank: int = Field(..., ge=0, le=5)


class ContentCommentReplyCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=20000)


class ContentCommentUpdate(BaseModel):
    body: str | None = Field(default=None, min_length=1, max_length=20000)
    rank: int | None = Field(default=None, ge=0, le=5)

    @field_validator("body")
    @classmethod
    def body_not_blank(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("body must not be blank")
        return v


class ContentCommentOut(BaseModel):
    id: str
    resource_type: str
    resource_id: str
    parent_comment_id: str | None
    body: str
    rank: int | None
    created_by: str
    created_by_name: str | None
    created_at: datetime
    updated_at: datetime
    replies: list["ContentCommentOut"] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class ContentCommentListResponse(BaseModel):
    items: list[ContentCommentOut]
    total: int
    avg_rank: float | None
    rank_count: int
