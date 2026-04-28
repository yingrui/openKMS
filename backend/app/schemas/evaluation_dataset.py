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


class EvaluationDatasetItemListResponse(BaseModel):
    items: list[EvaluationDatasetItemResponse]
    total: int


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
    generated_answer: str | None = None
    qa_sources: list[SearchResultSnippet] = []
    pass_: bool = Field(False, alias="pass")
    score: float = 0.0
    reasoning: str = ""

    model_config = {"populate_by_name": True}


class EvaluationRunRequestBody(BaseModel):
    """Body for POST .../run."""

    evaluation_type: str = "search_retrieval"


class EvaluationRunResponse(BaseModel):
    """Response after running evaluation (also matches persisted run summary + items)."""

    run_id: str
    evaluation_type: str
    status: str
    item_count: int
    pass_count: int
    avg_score: float | None
    error_message: str | None = None
    results: list[EvaluationRunResult]


class EvaluationRunListItem(BaseModel):
    id: str
    evaluation_type: str
    status: str
    item_count: int
    pass_count: int
    avg_score: float | None
    created_at: datetime
    judge_model_id: str | None = None
    judge_model_name: str | None = None

    model_config = {"from_attributes": True}


class EvaluationRunListResponse(BaseModel):
    items: list[EvaluationRunListItem]
    total: int


class EvaluationCompareRow(BaseModel):
    evaluation_dataset_item_id: str
    query: str
    expected_answer: str
    pass_a: bool
    score_a: float
    pass_b: bool
    score_b: float
    pass_changed: bool
    score_delta: float


class EvaluationCompareResponse(BaseModel):
    run_a_id: str
    run_b_id: str
    evaluation_type_a: str
    evaluation_type_b: str
    rows: list[EvaluationCompareRow]
