"""Pydantic schemas for evaluation dataset management."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# --- Evaluation Dataset ---

class EvaluationDatasetCreate(BaseModel):
    name: str
    knowledge_base_id: str
    description: str | None = None


class EvaluationDatasetUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class EvaluationDatasetResponse(BaseModel):
    id: str
    name: str
    knowledge_base_id: str
    knowledge_base_name: str | None = None
    description: str | None = None
    item_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EvaluationDatasetListResponse(BaseModel):
    items: list[EvaluationDatasetResponse]
    total: int


# --- Evaluation Dataset Item ---

class EvaluationDatasetItemCreate(BaseModel):
    query: str
    expected_answer: str
    topic: str | None = None
    sort_order: int = 0


class EvaluationDatasetItemUpdate(BaseModel):
    query: str | None = None
    expected_answer: str | None = None
    topic: str | None = None
    sort_order: int | None = None


class EvaluationDatasetItemResponse(BaseModel):
    id: str
    evaluation_dataset_id: str
    query: str
    expected_answer: str
    topic: str | None = None
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Run Evaluation ---


class SearchResultSnippet(BaseModel):
    """Truncated search result for evaluation response."""

    content: str
    score: float
    source_type: str


class EvaluationRunResult(BaseModel):
    item_id: str
    query: str
    expected_answer: str
    search_results: list[SearchResultSnippet] = []
    pass_: bool = Field(False, alias="pass")
    score: float = 0.0
    reasoning: str = ""

    model_config = {"populate_by_name": True}


class EvaluationRunResponse(BaseModel):
    results: list[EvaluationRunResult]
