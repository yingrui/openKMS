"""Request/response schemas for the QA agent API."""
from typing import Any

from pydantic import BaseModel


class SourceItem(BaseModel):
    id: str
    source_type: str
    content: str
    score: float
    source_name: str | None = None
    document_id: str | None = None
    wiki_page_id: str | None = None
    wiki_space_id: str | None = None
    doc_metadata: dict[str, Any] | None = None
    chunk_index: int | None = None
    retrieval_mode: str | None = None
    retrieval_debug: dict[str, Any] | None = None


class AskRequest(BaseModel):
    """Body for ask; path ``kb_id`` is authoritative when using ``/knowledge-bases/{kb_id}/ask``."""

    question: str
    conversation_history: list[dict[str, str]] = []
    access_token: str = ""
    #: Opaque id (e.g. UUID) so Langfuse groups turns under one **Session**; optional.
    session_id: str | None = None
    #: Skill ids from the KB settings; null/omit → core skills only.
    agent_skills: list[str] | None = None
    #: Optional; must match path kb_id when both are set. Prefer path.
    knowledge_base_id: str | None = None


class AskResponse(BaseModel):
    answer: str
    sources: list[SourceItem] = []


class RetrieveRequest(BaseModel):
    query: str
    access_token: str = ""
    top_k: int = 5
    agent_skills: list[str] | None = None
    knowledge_base_id: str | None = None


class RetrieveResponse(BaseModel):
    results: list[SourceItem] = []


def resolve_kb_id(path_kb_id: str | None, body_kb_id: str | None) -> str:
    """Path wins; body must match if both present."""
    path = (path_kb_id or "").strip()
    body = (body_kb_id or "").strip() if body_kb_id else ""
    if path and body and path != body:
        raise ValueError(f"knowledge_base_id mismatch: path={path!r} body={body!r}")
    kb = path or body
    if not kb:
        raise ValueError("knowledge_base_id required")
    return kb
