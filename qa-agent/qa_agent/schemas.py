"""Request/response schemas for the QA agent API."""
from pydantic import BaseModel


class SourceItem(BaseModel):
    id: str
    source_type: str
    content: str
    score: float
    source_name: str | None = None
    document_id: str | None = None


class AskRequest(BaseModel):
    knowledge_base_id: str
    question: str
    conversation_history: list[dict[str, str]] = []


class AskResponse(BaseModel):
    answer: str
    sources: list[SourceItem] = []
