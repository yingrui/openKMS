"""API schemas for embedded agent (LangGraph)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AgentConversationCreate(BaseModel):
    surface: str = Field(min_length=1, max_length=64)
    context: dict[str, Any] = Field(default_factory=dict)
    title: str | None = Field(default=None, max_length=512)


class AgentConversationResponse(BaseModel):
    id: str
    user_sub: str
    surface: str
    context: dict[str, Any]
    title: str | None
    created_at: datetime
    updated_at: datetime


class AgentMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=48000)
    # When true, the response is NDJSON (`application/x-ndjson`) instead of JSON: user row, then delta lines, then done.
    stream: bool = False
    #: Opaque id for optional Langfuse **Session** grouping (embedded wiki agent); omit to use conversation id.
    session_id: str | None = Field(default=None, max_length=256)


class AgentMessageItem(BaseModel):
    id: str
    role: str
    content: str
    tool_calls: list | dict | None = None
    created_at: datetime


class AgentMessageListResponse(BaseModel):
    """Paginated message list for long threads."""

    items: list[AgentMessageItem]
    total: int
    limit: int
    offset: int


class AgentMessagePostResponse(BaseModel):
    message: AgentMessageItem
    assistant: AgentMessageItem


class AgentConversationUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=512)
