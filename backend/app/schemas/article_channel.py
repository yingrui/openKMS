"""Article channel tree schemas."""

from typing import Any

from pydantic import BaseModel, Field


class ReviewCriterion(BaseModel):
    id: str
    label: str
    description: str = ""


class ArticleChannelNode(BaseModel):
    id: str
    name: str
    description: str | None = None
    sort_order: int = 0
    review_model_id: str | None = None
    review_prompt: str | None = None
    review_criteria: list[dict[str, Any]] | None = None
    children: list["ArticleChannelNode"] = []

    model_config = {"from_attributes": True}


ArticleChannelNode.model_rebuild()


class ArticleChannelTreeListResponse(BaseModel):
    items: list[ArticleChannelNode]
    total: int
    limit: int
    offset: int


class ArticleChannelCreate(BaseModel):
    name: str
    description: str | None = None
    parent_id: str | None = None
    sort_order: int = 0


class ArticleChannelUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=256)
    description: str | None = Field(default=None, max_length=1024)
    parent_id: str | None = None
    sort_order: int | None = None
    review_model_id: str | None = None
    review_prompt: str | None = None
    review_criteria: list[dict[str, Any]] | None = None


class ArticleChannelMergeBody(BaseModel):
    source_channel_id: str
    target_channel_id: str
    include_descendants: bool = True


class ArticleChannelReorderBody(BaseModel):
    direction: str  # "up" | "down"
