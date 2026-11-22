"""Request/response shapes for Workforce agents."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.kb_agent_config import AgentConfig

# --- Agent ---


class WorkforceAgentCreate(BaseModel):
    name: str
    description: str | None = None
    #: Skill ids; null → the qa-agent core defaults.
    #: `{capability_id: "all" | [tool_id, ...]}`.
    agent_tools: dict[str, object] | None = None
    #: Runtime configuration. `retrieval` is ignored here: depth belongs to the knowledge source.
    agent_config: AgentConfig | None = None
    #: Knowledge sources to bind at creation. Each one is checked against the creator's read access.
    knowledge_base_ids: list[str] = Field(default_factory=list)


class WorkforceAgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    #: `{capability_id: "all" | [tool_id, ...]}`.
    agent_tools: dict[str, object] | None = None
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
    #: `{capability_id: "all" | [tool_id, ...]}`.
    agent_tools: dict[str, object] | None = None
    #: The single web-search connector this agent may use; the screen resolves its name from the connector list.
    web_search_connector_id: str | None = None
    agent_config: dict[str, Any] | None = None
    #: Set when this agent is a knowledge base's default runtime (its own Q&A resolves it).
    origin_knowledge_base_id: str | None = None
    knowledge_base_count: int = 0
    semantic_model_count: int = 0
    ontology_group_count: int = 0
    #: Keys still valid (revoked ones are not counted: a list that includes them reads as "already rotated").
    credential_count: int = 0
    #: Activity over the last 7 days, read from the audit trail — see `services/workforce/usage.py` for why the
    #: window is 7 days here and all-time for votes.
    calls_7d: int = 0
    errors_7d: int = 0
    last_call_at: datetime | None = None
    upvotes: int = 0
    downvotes: int = 0
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


class WorkforceFeedbackRequest(BaseModel):
    """A reader's verdict on one answer. `vote = null` withdraws it."""

    message_id: str
    conversation_id: str | None = None
    vote: Literal["up", "down"] | None = None


class WorkforceFeedbackResponse(BaseModel):
    message_id: str
    vote: Literal["up", "down"] | None = None


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
    #: True when a configured policy replaced the answer with the agent's refusal text; `answer` then holds that text.
    refused: bool = False
    #: `{reason, contact}` — a stable code (`unsourced_numbers` | `no_citations`) and where the caller goes next.
    refusal: dict[str, Any] | None = None
    prompt_version: str | None = None
    #: The model that answered — an agent may choose one, so the reply names it.
    model: str | None = None


class WorkforcePromptPreviewRequest(BaseModel):
    """Texts to preview instead of the stored ones — the editor's current content, saved or not."""

    system_prompt: str | None = None
    agents_md: str | None = None


class WorkforcePromptPreviewResponse(BaseModel):
    """What the model is given before a question arrives, as the qa-agent assembles it."""

    #: The assembled prompt the model receives (base instruction + skills + policy + retrieval slot).
    system_prompt: str
    #: The same prompt as labelled pieces (`key` names the owner: identity / instruction / conventions / skills /
    #: tools / policy / context), so the reader can tell which tab to change.
    sections: list[dict[str, Any]] = []
    #: The base instruction alone: the part an author writes. None means the built-in text is in use.
    base_instruction: str | None = None
    #: The text that becomes `AGENTS.md` in the session workspace; None when the agent wrote none.
    agents_md: str | None = None


class WorkforceInstalledSkill(BaseModel):
    """A skill package installed on an agent, resolved against the global registry."""

    skill_id: str
    display_name: str
    version: str = ""
    #: False when the registry entry disappeared while this agent still names it.
    available: bool = True


class WorkforceWebSearchConnectorSet(BaseModel):
    #: `null` clears the binding.
    connector_id: str | None = None


class WorkforceSkillInstall(BaseModel):
    skill_id: str
    #: Omitted installs the registry's default version.
    version: str | None = None


class WorkforceAvailableSkill(BaseModel):
    """A package in the global skill registry, as the workforce Skills tab lists it."""

    skill_id: str
    display_name: str
    default_version: str | None = None
    versions: list[str] = []


# --- Operations queue ---


class WorkforceIssueResponse(BaseModel):
    id: str
    agent_id: str
    agent_name: str = ""
    #: negative_feedback | refusal | violation | risk | prompt_injection
    kind: str
    severity: str
    summary: str
    detail: dict[str, Any] | None = None
    status: str
    resolution: str | None = None
    resolved_by: str | None = None
    resolved_at: datetime | None = None
    created_at: datetime


class WorkforceIssueListResponse(BaseModel):
    items: list[WorkforceIssueResponse]
    total: int
    #: Counts per status across everything the caller can see, so the filter can show "3 open" without a second call.
    counts: dict[str, int] = Field(default_factory=dict)


class WorkforceIssueUpdate(BaseModel):
    status: Literal["open", "resolved", "ignored"]
    #: Required to resolve. "Solved, no idea how" is not a resolution.
    resolution: str | None = Field(None, max_length=2000)
