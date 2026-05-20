"""Pydantic schemas for knowledge base management."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, model_validator


# --- Knowledge Base ---

class KnowledgeBaseCreate(BaseModel):
    name: str
    description: str | None = None
    embedding_model_id: str | None = None
    judge_model_id: str | None = None
    agent_url: str | None = None
    chunk_config: dict[str, Any] | None = None
    faq_prompt: str | None = None
    metadata_keys: list[str] | None = None


class KnowledgeBaseUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    embedding_model_id: str | None = None
    judge_model_id: str | None = None
    agent_url: str | None = None
    chunk_config: dict[str, Any] | None = None
    faq_prompt: str | None = None
    metadata_keys: list[str] | None = None


class KnowledgeBaseResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    embedding_model_id: str | None = None
    judge_model_id: str | None = None
    agent_url: str | None = None
    chunk_config: dict[str, Any] | None = None
    faq_prompt: str | None = None
    metadata_keys: list[str] | None = None
    document_count: int = 0
    wiki_space_count: int = 0
    faq_count: int = 0
    chunk_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class KnowledgeBaseListResponse(BaseModel):
    items: list[KnowledgeBaseResponse]
    total: int


# --- KB Documents ---

class KBDocumentAdd(BaseModel):
    document_id: str


class KBDocumentResponse(BaseModel):
    id: str
    knowledge_base_id: str
    document_id: str
    document_name: str | None = None
    document_file_type: str | None = None
    document_status: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- KB wiki spaces ---

class KBWikiSpaceAdd(BaseModel):
    wiki_space_id: str


class KBWikiSpaceResponse(BaseModel):
    id: str
    knowledge_base_id: str
    wiki_space_id: str
    wiki_space_name: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class WikiPageForKbIndexItem(BaseModel):
    """Wiki page row for offline KB indexing (includes body)."""

    id: str
    wiki_space_id: str
    path: str
    title: str
    body: str
    metadata: dict[str, Any] | None = None


class WikiPageForKbIndexListResponse(BaseModel):
    items: list[WikiPageForKbIndexItem]
    total: int
    offset: int
    limit: int


# --- FAQs ---

class FAQCreate(BaseModel):
    question: str
    answer: str
    document_id: str | None = None
    doc_metadata: dict[str, Any] | None = None


class FAQUpdate(BaseModel):
    question: str | None = None
    answer: str | None = None
    doc_metadata: dict[str, Any] | None = None


class FAQGenerateRequest(BaseModel):
    document_ids: list[str]
    model_id: str
    prompt: str | None = None


class FAQGenerateResult(BaseModel):
    """Generated FAQ pair (preview, not yet saved)."""
    document_id: str
    document_name: str | None = None
    question: str
    answer: str
    doc_metadata: dict[str, Any] | None = None


class FAQBatchItem(BaseModel):
    document_id: str
    question: str
    answer: str
    doc_metadata: dict[str, Any] | None = None


class FAQBatchCreateRequest(BaseModel):
    items: list[FAQBatchItem]


class FAQResponse(BaseModel):
    id: str
    knowledge_base_id: str
    document_id: str | None = None
    document_name: str | None = None
    question: str
    answer: str
    doc_metadata: dict[str, Any] | None = None
    has_embedding: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FAQListResponse(BaseModel):
    items: list[FAQResponse]
    total: int


# --- Chunks ---

class ChunkBatchItem(BaseModel):
    id: str
    document_id: str | None = None
    wiki_page_id: str | None = None
    content: str
    chunk_index: int
    token_count: int | None = None
    embedding: str  # base64-encoded float32 array
    chunk_metadata: dict[str, Any] | None = None
    doc_metadata: dict[str, Any] | None = None

    @model_validator(mode="after")
    def _exactly_one_chunk_source(self) -> "ChunkBatchItem":
        has_doc = self.document_id is not None and str(self.document_id).strip() != ""
        has_wiki = self.wiki_page_id is not None and str(self.wiki_page_id).strip() != ""
        if has_doc == has_wiki:
            raise ValueError("Each chunk must set exactly one of document_id or wiki_page_id")
        return self


class ChunkBatchCreateRequest(BaseModel):
    items: list[ChunkBatchItem]


class ChunkUpdate(BaseModel):
    content: str | None = None
    doc_metadata: dict[str, Any] | None = None


class FAQEmbeddingUpdate(BaseModel):
    id: str
    embedding: str  # base64-encoded float32 array
    doc_metadata: dict[str, Any] | None = None


class FAQBatchEmbeddingsRequest(BaseModel):
    items: list[FAQEmbeddingUpdate]


class ChunkResponse(BaseModel):
    id: str
    knowledge_base_id: str
    document_id: str | None = None
    wiki_page_id: str | None = None
    wiki_space_id: str | None = None
    document_name: str | None = None
    content: str
    chunk_index: int
    token_count: int | None = None
    has_embedding: bool = False
    chunk_metadata: dict[str, Any] | None = None
    doc_metadata: dict[str, Any] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChunkListResponse(BaseModel):
    items: list[ChunkResponse]
    total: int


# --- Search ---

class SearchRequest(BaseModel):
    query: str
    top_k: int = 10
    search_type: str = "all"
    label_filters: dict[str, str | list[str]] | None = None
    metadata_filters: dict[str, Any] | None = None
    include_historical_documents: bool = False
    force_dense: bool = False  # internal: qa-agent sets this to bypass hybrid recursion


class SearchResult(BaseModel):
    id: str
    source_type: str
    content: str
    score: float
    source_name: str | None = None
    document_id: str | None = None
    wiki_page_id: str | None = None
    wiki_space_id: str | None = None
    doc_metadata: dict[str, Any] | None = None


class SearchResponse(BaseModel):
    results: list[SearchResult]
    query: str


# --- Ask (QA proxy) ---

class AskRequest(BaseModel):
    question: str
    conversation_history: list[dict[str, str]] = []
    #: Sent to the QA agent as ``langfuse_session_id`` so traces group into one Langfuse **Session** (opaque string, e.g. UUID).
    session_id: str | None = None


class AskResponse(BaseModel):
    answer: str
    sources: list[SearchResult] = []
