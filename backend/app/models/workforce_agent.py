"""Workforce agents: Q&A services that put a knowledge base to work for external callers.

A knowledge base says *what is known* (documents, wiki pages, FAQ, chunks, embeddings, retrieval
depth). A workforce agent says *how that knowledge answers for someone outside openKMS* — the
instructions, the model, the skills, the answer policy, the workspace and sandbox, and the slice of
Catalog / Ontology it may consult. One knowledge base may back several agents with different roles.

The agent is a **delegated read-only identity of its owner**: binding a knowledge base requires the
owner to be able to read it, and the agent's credentials never outlive the owner. See
`docs/features/workforce.md`.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

#: Active agents serve; archived agents are hidden and their credentials stop working. Archive,
#: not delete: the binding rows and the audit trail keep pointing at a row that exists.
AGENT_STATUS_ACTIVE = "active"
#: Serves nothing, but keeps its configuration and credentials: maintenance, an audit window, a model switch. Archive
#: means delete; this means "not right now".
AGENT_STATUS_PAUSED = "paused"
AGENT_STATUS_ARCHIVED = "archived"


class WorkforceAgent(Base):
    __tablename__ = "workforce_agents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    #: The creator. Their identity is the ceiling on what the agent may read; deleting the owner
    #: invalidates the agent because nothing resolves `owner_sub` any more.
    owner_sub: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    owner_name: Mapped[str | None] = mapped_column(String(256), nullable=True)

    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=AGENT_STATUS_ACTIVE, server_default=AGENT_STATUS_ACTIVE
    )

    #: The tool ledger: `{capability_id: "all" | [tool_id, ...]}`. A missing key means the capability is off; `"all"`
    #: follows the capability as the runtime grows it; a list is an explicit subset ("shell but not python" is
    #: `{"code_execution": ["exec.shell"]}`). `null` → the core capabilities, same rule as a knowledge base.
    agent_tools: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    #: The agent's runtime configuration minus `retrieval` — retrieval depth is a property of the
    #: knowledge source (`knowledge_bases.agent_config.retrieval`) and is merged in at request time.
    agent_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    #: Installed skill packages, `{"<skill_id>": "<version>"}`. Skills are instruction packages from the workforce
    #: registry, not tool switches: installing one adds its SKILL.md to the prompt, while a tool is a capability the
    #: runtime enforces. `agent_tools` above keeps the tool ledger for that reason.
    installed_skills: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    #: The one web-search connector this agent may use, if it enables the `web_search` capability. A single binding on
    #: purpose: two providers answer the same question, so "which one" is a deployment decision, not a model choice.
    web_search_connector_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("connectors.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    #: Set when the agent was created as a knowledge base's default runtime, so the knowledge base's
    #: own Q&A resolves one agent instead of keeping a second copy of the same configuration.
    origin_knowledge_base_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("knowledge_bases.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class WorkforceAgentKB(Base):
    """The knowledge sources an agent may answer from."""

    __tablename__ = "workforce_agent_kbs"
    __table_args__ = (
        UniqueConstraint("agent_id", "knowledge_base_id", name="uq_workforce_agent_kb"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    agent_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("workforce_agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    knowledge_base_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: How this agent names the source ("制度库", "财报"). Absent → the knowledge base name.
    label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    #: Ordering for a caller that shows the sources; lower first. Not a routing policy.
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WorkforceAgentSemanticModel(Base):
    """Catalog models the agent may query (replaces the per-KB scope for a workforce agent)."""

    __tablename__ = "workforce_agent_semantic_models"
    __table_args__ = (
        UniqueConstraint("agent_id", "semantic_model_id", name="uq_workforce_agent_semantic_model"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    agent_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("workforce_agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    semantic_model_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("semantic_models.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WorkforceAgentOntologyGroup(Base):
    """Ontology groups whose object types and links the agent may read."""

    __tablename__ = "workforce_agent_ontology_groups"
    __table_args__ = (
        UniqueConstraint("agent_id", "ontology_group_id", name="uq_workforce_agent_ontology_group"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    agent_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("workforce_agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ontology_group_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("ontology_groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WorkforceAgentCredential(Base):
    """A service credential for one agent (`wfks.{id}.{secret}`).

    Separate from a personal API key on purpose: revoking it stops this agent without touching the
    owner's own access, and the audit trail says *which agent* called rather than "some user".
    """

    __tablename__ = "workforce_agent_credentials"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    agent_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("workforce_agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    #: First characters of the token for display; the secret itself is only hashed.
    key_prefix: Mapped[str] = mapped_column(String(32), nullable=False)
    secret_hash: Mapped[str] = mapped_column(Text, nullable=False)

    #: `local` | `oidc` — how the owner's identity was resolved when the credential was issued.
    auth_mode: Mapped[str] = mapped_column(String(16), nullable=False, default="local")
    #: OIDC only: the owner's realm roles at issue time, mirroring a personal API key. A credential
    #: carries its owner's identity; re-resolving roles on every call would let a role change made
    #: for unrelated reasons silently widen what an integrator can read.
    oidc_realm_roles: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


#: A reader's verdict on one answer.
FEEDBACK_UP = "up"
FEEDBACK_DOWN = "down"


class WorkforceAnswerFeedback(Base):
    """One person's thumbs on one answer (`up` / `down`).

    The control has existed on the conversation screen since it shipped, but only as component state: a reload
    lost every vote, so "is this agent answering well" had no answer. The row points at the message rather than
    copying its text — the answer already lives in `agent_messages`, and a second copy of a conversation is a
    second truth to keep in step (and one more place the conversation's content is stored).
    """

    __tablename__ = "workforce_answer_feedback"
    __table_args__ = (
        # One verdict per reader per answer: changing one's mind edits the row instead of adding a second vote.
        UniqueConstraint("message_id", "actor_sub", name="uq_workforce_feedback_message_voter"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    agent_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("workforce_agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: The conversation the answer belongs to; nullable because a thread may be deleted before its votes.
    conversation_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    message_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    vote: Mapped[str] = mapped_column(String(4), nullable=False)
    #: Who voted. A service credential acts for its owner, so this is the owner's subject, not the agent's.
    actor_sub: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    actor_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
