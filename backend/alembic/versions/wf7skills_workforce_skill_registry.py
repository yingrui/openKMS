"""workforce: a skill registry of its own

Revision ID: wf7skills
Revises: wf6skills

Digital employees get their own skills. A workforce skill is authored in the product (a `SKILL.md`
plus optional Python scripts), edited as a draft and published as an immutable version, which is not
what an Agent Project package is (a zip uploaded whole). Two registries, no shared rows.

`workforce_agents.installed_skills` used to name ids in Agent Project's `agent_skills`. Those ids do
not mean the same thing here, so the bindings are dropped rather than mapped: there were no workforce
skills in use, and a mapping would claim two different assets are the same one.
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "wf7skills"
down_revision = "wf6skills"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workforce_skills",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=512), nullable=True),
        sa.Column("created_by_name", sa.String(length=256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_workforce_skills_created_by", "workforce_skills", ["created_by"])

    op.create_table(
        "workforce_skill_versions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "skill_id",
            sa.String(length=64),
            sa.ForeignKey("workforce_skills.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="draft", nullable=False),
        sa.Column("files", JSONB(), nullable=True),
        sa.Column("entrypoint", sa.String(length=256), nullable=True),
        sa.Column("subcommands", JSONB(), nullable=True),
        sa.Column("content_hash", sa.String(length=64), nullable=True),
        sa.Column("size_bytes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_by", sa.String(length=512), nullable=True),
        sa.Column("published_by_name", sa.String(length=256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint(
            "skill_id", "version", name="uq_workforce_skill_versions_skill_version"
        ),
    )
    op.create_index(
        "ix_workforce_skill_versions_skill_id", "workforce_skill_versions", ["skill_id"]
    )
    # One open draft per skill; releases are history and repeat their skill freely.
    op.create_index(
        "uq_workforce_skill_versions_draft",
        "workforce_skill_versions",
        ["skill_id"],
        unique=True,
        postgresql_where=sa.text("status = 'draft'"),
    )

    # Bindings that pointed at Agent Project's registry would now resolve to nothing useful.
    op.execute("UPDATE workforce_agents SET installed_skills = NULL WHERE installed_skills IS NOT NULL")


def downgrade() -> None:
    op.drop_index("uq_workforce_skill_versions_draft", table_name="workforce_skill_versions")
    op.drop_index("ix_workforce_skill_versions_skill_id", table_name="workforce_skill_versions")
    op.drop_table("workforce_skill_versions")
    op.drop_index("ix_workforce_skills_created_by", table_name="workforce_skills")
    op.drop_table("workforce_skills")
