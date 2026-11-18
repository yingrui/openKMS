"""workforce agents: tables, and one default agent per existing knowledge base

Revision ID: wf1agents
Revises: dm1dimensionclean

A knowledge base says *what is known*; a workforce agent says *how it answers for an outside caller*.
This revision adds the agent tables and gives every existing knowledge base one default agent, copied
from the runtime configuration the knowledge base already carries, so nothing changes until someone
edits an agent. `retrieval` stays on the knowledge base — retrieval depth is a property of the corpus.

See `docs/features/workforce.md` and `app/services/workforce/agent_config.py`.
"""

from __future__ import annotations

import json
import uuid

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "wf1agents"
down_revision = "dm1dimensionclean"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workforce_agents",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("owner_sub", sa.String(512), nullable=False, index=True),
        sa.Column("owner_name", sa.String(256), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("agent_skills", postgresql.JSONB(), nullable=True),
        sa.Column("agent_config", postgresql.JSONB(), nullable=True),
        sa.Column(
            "origin_knowledge_base_id",
            sa.String(64),
            sa.ForeignKey("knowledge_bases.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "workforce_agent_kbs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "agent_id",
            sa.String(64),
            sa.ForeignKey("workforce_agents.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "knowledge_base_id",
            sa.String(64),
            sa.ForeignKey("knowledge_bases.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("label", sa.String(128), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("agent_id", "knowledge_base_id", name="uq_workforce_agent_kb"),
    )

    op.create_table(
        "workforce_agent_semantic_models",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "agent_id",
            sa.String(64),
            sa.ForeignKey("workforce_agents.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "semantic_model_id",
            sa.String(64),
            sa.ForeignKey("semantic_models.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("agent_id", "semantic_model_id", name="uq_workforce_agent_semantic_model"),
    )

    op.create_table(
        "workforce_agent_ontology_groups",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "agent_id",
            sa.String(64),
            sa.ForeignKey("workforce_agents.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "ontology_group_id",
            sa.String(64),
            sa.ForeignKey("ontology_groups.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("agent_id", "ontology_group_id", name="uq_workforce_agent_ontology_group"),
    )

    op.create_table(
        "workforce_agent_credentials",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "agent_id",
            sa.String(64),
            sa.ForeignKey("workforce_agents.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(128), nullable=False, server_default=""),
        sa.Column("key_prefix", sa.String(32), nullable=False),
        sa.Column("secret_hash", sa.Text(), nullable=False),
        sa.Column("auth_mode", sa.String(16), nullable=False, server_default="local"),
        sa.Column("oidc_realm_roles", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )

    _seed_default_agents()


def _seed_default_agents() -> None:
    """Give every knowledge base the agent its own Q&A will resolve.

    The copy is the knowledge base's current runtime configuration minus `retrieval`, so the answers a
    knowledge base gives today are exactly what its default agent gives after the upgrade.
    """
    conn = op.get_bind()
    kbs = conn.execute(
        sa.text(
            "SELECT id, name, description, agent_skills, agent_config, created_by, created_by_name "
            "FROM knowledge_bases ORDER BY created_at"
        )
    ).fetchall()
    for kb_id, name, description, skills, config, owner_sub, owner_name in kbs:
        agent_id = f"wf-{uuid.uuid4()}"
        runtime = config if isinstance(config, dict) else None
        if runtime is not None:
            runtime = {k: v for k, v in runtime.items() if k != "retrieval"} or None
        conn.execute(
            sa.text(
                "INSERT INTO workforce_agents "
                "(id, name, description, owner_sub, owner_name, status, agent_skills, agent_config, "
                " origin_knowledge_base_id) "
                "VALUES (:id, :name, :desc, :owner, :owner_name, 'active', "
                "        CAST(:skills AS jsonb), CAST(:config AS jsonb), :kb)"
            ),
            {
                "id": agent_id,
                "name": name,
                "desc": description,
                "owner": owner_sub or "",
                "owner_name": owner_name,
                "skills": json.dumps(skills) if skills is not None else None,
                "config": json.dumps(runtime) if runtime is not None else None,
                "kb": kb_id,
            },
        )
        conn.execute(
            sa.text(
                "INSERT INTO workforce_agent_kbs (id, agent_id, knowledge_base_id, label, priority) "
                "VALUES (:id, :agent, :kb, NULL, 0)"
            ),
            {"id": f"wfkb-{uuid.uuid4()}", "agent": agent_id, "kb": kb_id},
        )
        for row in conn.execute(
            sa.text("SELECT semantic_model_id FROM kb_semantic_models WHERE knowledge_base_id = :kb"),
            {"kb": kb_id},
        ).fetchall():
            conn.execute(
                sa.text(
                    "INSERT INTO workforce_agent_semantic_models (id, agent_id, semantic_model_id) "
                    "VALUES (:id, :agent, :model)"
                ),
                {"id": f"wfsm-{uuid.uuid4()}", "agent": agent_id, "model": row[0]},
            )
        for row in conn.execute(
            sa.text("SELECT ontology_group_id FROM kb_ontology_groups WHERE knowledge_base_id = :kb"),
            {"kb": kb_id},
        ).fetchall():
            conn.execute(
                sa.text(
                    "INSERT INTO workforce_agent_ontology_groups (id, agent_id, ontology_group_id) "
                    "VALUES (:id, :agent, :group)"
                ),
                {"id": f"wfog-{uuid.uuid4()}", "agent": agent_id, "group": row[0]},
            )


def downgrade() -> None:
    op.drop_table("workforce_agent_credentials")
    op.drop_table("workforce_agent_ontology_groups")
    op.drop_table("workforce_agent_semantic_models")
    op.drop_table("workforce_agent_kbs")
    op.drop_table("workforce_agents")
