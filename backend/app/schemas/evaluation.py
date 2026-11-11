"""Pydantic schemas for evaluation management."""
from datetime import datetime

from typing import Any, Literal

from pydantic import BaseModel, Field

#: What an item holds. Decides the editor's columns and which run types are allowed.
EvaluationKind = Literal["answer", "query", "content"]

KIND_RUN_TYPES: dict[str, tuple[str, ...]] = {
    "answer": ("search_retrieval", "qa_answer"),
    "query": ("data_query",),
    "content": ("wiki_content_coverage",),
}


class EvaluationCreate(BaseModel):
    name: str
    knowledge_base_id: str
    kind: EvaluationKind = "answer"
    wiki_space_id: str | None = None
    description: str | None = None
    #: A data-query evaluation judges a semantic model's answers (mutually exclusive with wiki in practice).
    semantic_model_id: str | None = None
    data_resource_id: str | None = None


class EvaluationUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    knowledge_base_id: str | None = None
    wiki_space_id: str | None = None
    semantic_model_id: str | None = None
    data_resource_id: str | None = None


class EvaluationResponse(BaseModel):
    id: str
    name: str
    kind: EvaluationKind = "answer"
    knowledge_base_id: str
    knowledge_base_name: str | None = None
    wiki_space_id: str | None = None
    wiki_space_name: str | None = None
    semantic_model_id: str | None = None
    data_resource_id: str | None = None
    description: str | None = None
    item_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EvaluationListResponse(BaseModel):
    items: list[EvaluationResponse]
    total: int
    limit: int
    offset: int


class EvaluationItemCreate(BaseModel):
    query: str
    #: Required for `answer`/`content` items; absent for `query` items, whose ground truth is `expected_query`.
    expected_answer: str | None = None
    topic: str | None = None
    sort_order: int = 0
    #: Data-query ground truth: every query the answer should have made.
    expected_query: list[dict[str, Any]] | None = None


class EvaluationItemUpdate(BaseModel):
    query: str | None = None
    expected_answer: str | None = None
    topic: str | None = None
    sort_order: int | None = None
    expected_query: list[dict[str, Any]] | None = None


class EvaluationItemResponse(BaseModel):
    id: str
    evaluation_id: str
    query: str
    expected_answer: str | None = None
    topic: str | None = None
    sort_order: int
    expected_query: list[dict[str, Any]] | None = None
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


class DataQuerySource(BaseModel):
    """One query the answer cited — the thing a data-query evaluation judges."""

    mode: str | None = None
    model_id: str | None = None
    metric: str | None = None
    sql: str | None = None


class EvaluationRunResult(BaseModel):
    item_id: str
    query: str
    expected_answer: str | None = None
    search_results: list[SearchResultSnippet] = []
    generated_answer: str | None = None
    qa_sources: list[SearchResultSnippet] = []
    #: Data-query sources the answer cited (data_query evaluation only).
    data_queries: list[DataQuerySource] = []
    coverage: float | None = None
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
    expected_answer: str | None = None
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
