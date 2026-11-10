"""Per-KB agent configuration: one JSONB object, validated on write.

The design is in `docs/features/knowledge-base-qa-agent.md`. The rule that shapes this file: **fields here are the things a
deployment may legitimately differ on** — retrieval depth, whether the agent may touch files, how strict the answer policy
is. What must *not* vary per KB (a number must come from a cited query; do not answer a different question) stays in code
with tests.

Two other rules are encoded below rather than documented: references carry ids and never secrets, and there is no KB-level
memory — memory is per conversation and per user.

Every field has a default equal to today's behaviour, so an empty `agent_config` changes nothing.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

#: Today's `top_k` is hard-coded to 5 in `qa_agent/agent.py`; this is the value an empty config keeps.
DEFAULT_TOP_K = 5

#: The skills the agent has always had. `workspace` is opt-in, so a KB that does not want file tools needs no opt-out.
DEFAULT_TOOLS = ("ontology", "catalog", "page_index")

KNOWN_TOOLS = frozenset({*DEFAULT_TOOLS, "workspace"})


class PromptsConfig(BaseModel):
    """KB-wide instructions — not a prompt store.

    `agents_md` is a single text field, copied into the session workspace as `AGENTS.md` at creation. It is deliberately not
    section 3's versioned store: that needs a publish gate and an evaluation suite to be worth having, and neither exists
    yet. `MEMORY.md` is absent on purpose — memory is per conversation and per user, and a KB-level one would let one
    session's content into another's answers.
    """

    model_config = ConfigDict(extra="forbid")

    agents_md: str | None = Field(None, max_length=20_000)


class RetrievalConfig(BaseModel):
    """How much context the agent retrieves. Depth is a KB property: a dense quant KB and an FAQ-shaped KB want different
    numbers, and today both get the same hard-coded five."""

    model_config = ConfigDict(extra="forbid")

    top_k: int = Field(DEFAULT_TOP_K, ge=1, le=50)
    rerank: bool | None = None
    """`None` = whatever the deployment has configured; a KB may force it on or off."""
    min_score: float | None = Field(None, ge=0.0, le=1.0)


class AnswerPolicy(BaseModel):
    """What counts as an acceptable answer. Defaults are today's behaviour — the point is that they become *choosable*,
    and measurable, rather than implied."""

    model_config = ConfigDict(extra="forbid")

    unknown_measure: Literal["try_anyway", "refuse"] = "try_anyway"
    require_grounded_numbers: Literal["off", "mark", "enforce"] = "off"
    evidence_labels: Literal["flat", "used+consulted"] = "flat"
    require_schema_lookup: bool = False


class WorkspaceConfig(BaseModel):
    """The per-session directory. Off by default: the file layer is a capability a KB opts into."""

    model_config = ConfigDict(extra="forbid")

    enabled: bool = False
    disk_mb: int | None = Field(None, ge=0)
    session_ttl_minutes: int | None = Field(None, ge=0)
    artifact_max_mb: int | None = Field(None, ge=0)


class OrchestrationConfig(BaseModel):
    """Knobs on a fixed graph — an enum for shape, never a graph."""

    model_config = ConfigDict(extra="forbid")

    profile: Literal["rag_only", "rag_tools", "agent_loop"] = "rag_tools"
    max_tool_rounds: int | None = Field(None, ge=1, le=100)
    retrieve: Literal["always", "never", "on_miss"] = "always"


class ObservabilityConfig(BaseModel):
    """A Langfuse project is a **reference**: the secret lives in the credential store, never in the KB row."""

    model_config = ConfigDict(extra="forbid")

    langfuse_credential_id: str | None = None
    langfuse_tags: list[str] = []
    sample_rate: float | None = Field(None, ge=0.0, le=1.0)


class AgentConfig(BaseModel):
    """The whole object. Unknown keys are refused, so a typo in a field name is an error rather than a silent default."""

    model_config = ConfigDict(extra="forbid")

    tools: list[str] = list(DEFAULT_TOOLS)
    model_id: str | None = None
    prompts: PromptsConfig = PromptsConfig()
    retrieval: RetrievalConfig = RetrievalConfig()
    answer_policy: AnswerPolicy = AnswerPolicy()
    workspace: WorkspaceConfig = WorkspaceConfig()
    orchestration: OrchestrationConfig = OrchestrationConfig()
    observability: ObservabilityConfig = ObservabilityConfig()

    @field_validator("tools")
    @classmethod
    def _known_tools(cls, value: list[str]) -> list[str]:
        unknown = [t for t in value if t not in KNOWN_TOOLS]
        if unknown:
            # Silently dropping an unknown skill is how a typo becomes "the agent does nothing extra" instead of an error.
            raise ValueError(f"Unknown agent tool(s): {', '.join(sorted(unknown))}")
        seen: list[str] = []
        for tool in value:
            if tool not in seen:
                seen.append(tool)
        return seen


def parse_agent_config(raw: object) -> AgentConfig:
    """Stored JSON → validated config. `None`/empty gives every default, which is today's behaviour."""
    if not raw:
        return AgentConfig()
    if isinstance(raw, AgentConfig):
        return raw
    return AgentConfig.model_validate(raw)
