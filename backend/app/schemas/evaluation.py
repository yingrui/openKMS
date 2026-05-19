"""Pydantic schemas for evaluation management."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class EvaluationCreate(BaseModel):
    name: str
    knowledge_base_id: str
    wiki_space_id: str | None = None
    description: str | None = None


class EvaluationUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    knowledge_base_id: str | None = None
    wiki_space_id: str | None = None


class EvaluationResponse(BaseModel):
    id: str
    name: str
    knowledge_base_id: str
    knowledge_base_name: str | None = None
    wiki_space_id: str | None = None
    wiki_space_name: str | None = None
    description: str | None = None
    item_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EvaluationListResponse(BaseModel):
    items: list[EvaluationResponse]
    total: int


class EvaluationItemCreate(BaseModel):
    query: str
    expected_answer: str
    topic: str | None = None
    sort_order: int = 0


class EvaluationItemUpdate(BaseModel):
    query: str | None = None
    expected_answer: str | None = None
    topic: str | None = None
    sort_order: int | None = None


class EvaluationItemResponse(BaseModel):
    id: str
    evaluation_id: str
    query: str
    expected_answer: str
    topic: str | None = None
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


class EvaluationItemListResponse(BaseModel):
    items: list[EvaluationItemResponse]
    total: int


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

    model_config = {"from_attributes": True}


class EvaluationRunListResponse(BaseModel):
    items: list[EvaluationRunListItem]
    total: int


class EvaluationCompareRow(BaseModel):
    evaluation_item_id: str
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
