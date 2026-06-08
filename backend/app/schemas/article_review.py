"""Article LLM review schemas."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ReviewCriterion(BaseModel):
    id: str
    label: str
    description: str = ""


class ArticleReviewRequest(BaseModel):
    """Optional overrides; channel defaults apply when omitted."""

    model_id: str | None = None
    prompt: str | None = None


class ArticleReviewCriterionResult(BaseModel):
    id: str
    label: str | None = None
    score: float
    notes: str = ""


class ArticleReviewResult(BaseModel):
    overall_score: float
    pass_: bool = Field(alias="pass")
    summary: str = ""
    criteria: list[ArticleReviewCriterionResult] = []
    suggestions: list[str] = []

    model_config = {"populate_by_name": True}


class ArticleReviewResponse(BaseModel):
    id: str
    article_id: str
    review_model_id: str | None = None
    result: dict[str, Any]
    created_by: str | None = None
    created_by_name: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ArticleReviewListResponse(BaseModel):
    items: list[ArticleReviewResponse]
