"""Request/response schemas for the QA agent API."""
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


class AskRequest(BaseModel):
    knowledge_base_id: str
    question: str
    conversation_history: list[dict[str, str]] = []
    access_token: str = ""
    #: Opaque id (e.g. UUID) so Langfuse groups turns under one **Session**; optional.
    session_id: str | None = None


class AskResponse(BaseModel):
    answer: str
    sources: list[SourceItem] = []


class RetrieveRequest(BaseModel):
    knowledge_base_id: str
    query: str
    access_token: str = ""
    top_k: int = 5


class RetrieveResponse(BaseModel):
    results: list[SourceItem] = []
