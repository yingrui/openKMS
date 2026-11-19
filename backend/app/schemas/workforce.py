"""Request/response shapes for Workforce agents."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.kb_agent_config import AgentConfig

# --- Agent ---


class WorkforceAgentCreate(BaseModel):
    name: str
    description: str | None = None
    #: Skill ids; null → the qa-agent core defaults.
    agent_skills: list[str] | None = None
    #: Runtime configuration. `retrieval` is ignored here: depth belongs to the knowledge source.
    agent_config: AgentConfig | None = None
    #: Knowledge sources to bind at creation. Each one is checked against the creator's read access.
    knowledge_base_ids: list[str] = Field(default_factory=list)


class WorkforceAgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    agent_skills: list[str] | None = None
    agent_config: AgentConfig | None = None


class WorkforceAgentKBBinding(BaseModel):
    id: str
    knowledge_base_id: str
    knowledge_base_name: str | None = None
    label: str | None = None
    priority: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class WorkforceAgentSemanticModelBinding(BaseModel):
    id: str
    semantic_model_id: str
    name: str
    description: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class WorkforceAgentOntologyGroupBinding(BaseModel):
    id: str
    ontology_group_id: str
    display_name: str
    description: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class WorkforceAgentResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    status: str
    owner_sub: str
    owner_name: str | None = None
    agent_skills: list[str] | None = None
    agent_config: dict[str, Any] | None = None
    #: Set when this agent is a knowledge base's default runtime (its own Q&A resolves it).
    origin_knowledge_base_id: str | None = None
    knowledge_base_count: int = 0
    semantic_model_count: int = 0
    ontology_group_count: int = 0
    credential_count: int = 0
    created_at: datetime
    updated_at: datetime


class WorkforceAgentDetailResponse(WorkforceAgentResponse):
    knowledge_bases: list[WorkforceAgentKBBinding] = []
    semantic_models: list[WorkforceAgentSemanticModelBinding] = []
    ontology_groups: list[WorkforceAgentOntologyGroupBinding] = []


class WorkforceAgentListResponse(BaseModel):
    items: list[WorkforceAgentResponse]
    total: int
    limit: int
    offset: int


# --- Bindings ---


class WorkforceAgentKBAdd(BaseModel):
    knowledge_base_id: str
    label: str | None = None
    priority: int = 0


class WorkforceAgentSemanticModelAdd(BaseModel):
    semantic_model_id: str


class WorkforceAgentOntologyGroupAdd(BaseModel):
    ontology_group_id: str


# --- Credentials ---


class WorkforceCredentialCreate(BaseModel):
    name: str = ""


class WorkforceCredentialCreatedResponse(BaseModel):
    id: str
    name: str
    #: The full token. Returned once, at creation; only its hash is stored.
    token: str
    key_prefix: str
    created_at: datetime


class WorkforceCredentialListItem(BaseModel):
    id: str
    name: str
    key_prefix: str
    created_at: datetime
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None

    model_config = {"from_attributes": True}


class WorkforceCredentialListResponse(BaseModel):
    items: list[WorkforceCredentialListItem]


# --- Service plane (ask) ---


class WorkforceAskRequest(BaseModel):
    question: str
    #: Which bound knowledge source to answer from. Required in this version: one question, one source.
    kb_id: str
    conversation_history: list[dict[str, str]] = Field(default_factory=list)
    session_id: str | None = None


class WorkforceAskResponse(BaseModel):
    answer: str
    #: Which knowledge source produced the answer — the caller named it, the reply echoes it.
    kb_id: str
    sources: list[dict[str, Any]] = Field(default_factory=list)
    grounding: dict[str, Any] | None = None
    langfuse_trace_id: str | None = None
    warnings: list[str] = Field(default_factory=list)
    #: True only when the answer was checked against an enforced grounding policy and passed. With the policy off
    #: this is False, and `grounding["policy"]` distinguishes "not checked" from "checked and failed".
    verified: bool = False
    prompt_version: str | None = None
    #: The model that answered — an agent may choose one, so the reply names it.
    model: str | None = None
