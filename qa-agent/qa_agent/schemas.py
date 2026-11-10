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
    #: Structured Catalog / SQL Lab evidence (mode, sql, columns, rows, …).
    data_query: dict[str, Any] | None = None
    #: `used` when the answer's numbers came from this source, `consulted` when the query ran but nothing in the answer
    #: traces to it. Every source is kept either way — the labels are added, not a filter.
    usage: str | None = None
    #: How many of the answer's numbers appear in this source's rows (only meaningful for Catalog evidence).
    traceable_numbers: int | None = None


class AskRequest(BaseModel):
    """Body for ask; path ``kb_id`` is authoritative when using ``/knowledge-bases/{kb_id}/ask``."""

    question: str
    conversation_history: list[dict[str, str]] = []
    access_token: str = ""
    #: Opaque id (e.g. UUID) so Langfuse groups turns under one **Session**; optional.
    session_id: str | None = None
    #: Skill ids from the KB settings; null/omit → core skills only.
    agent_skills: list[str] | None = None
    #: The KB's agent configuration (`AgentConfig` on the backend, already validated there). Absent → defaults, which are
    #: today's behaviour: top_k 5, `try_anyway` answer policy, no workspace.
    agent_config: dict[str, Any] | None = None
    #: Optional; must match path kb_id when both are set. Prefer path.
    knowledge_base_id: str | None = None


class GroundingReport(BaseModel):
    """How many of the answer's numbers came from the cited results, as a ratio rather than a verdict."""

    traceable: int = 0
    total: int = 0
    ratio: float = 1.0
    untraced: list[float] = []


class AskResponse(BaseModel):
    answer: str
    sources: list[SourceItem] = []
    #: Present when the answer was judged against its own evidence. Always reported; whether anything acts on it is a
    #: per-KB policy (`answer_policy.require_grounded_numbers`).
    grounding: GroundingReport | None = None
    #: The Langfuse trace of this turn, when tracing is on. The handle an evaluation or a reviewer scores afterwards.
    langfuse_trace_id: str | None = None


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
