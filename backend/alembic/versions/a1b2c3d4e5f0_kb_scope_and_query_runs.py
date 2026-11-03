"""kb semantic models / ontology groups + semantic model query runs

Revision ID: a1b2c3d4e5f0
Revises: 80b4a31d1871
Create Date: 2026-04-03

Knowledge-base Q&A scope links (not RAG) and audit rows for ad-hoc query API runs.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a1b2c3d4e5f0"
down_revision: Union[str, Sequence[str], None] = "80b4a31d1871"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "kb_semantic_models",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("knowledge_base_id", sa.String(length=64), nullable=False),
        sa.Column("semantic_model_id", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["knowledge_base_id"], ["knowledge_bases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["semantic_model_id"], ["semantic_models.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("knowledge_base_id", "semantic_model_id", name="uq_kb_semantic_model"),
    )
    op.create_index("ix_kb_semantic_models_knowledge_base_id", "kb_semantic_models", ["knowledge_base_id"])
    op.create_index("ix_kb_semantic_models_semantic_model_id", "kb_semantic_models", ["semantic_model_id"])

    op.create_table(
        "kb_ontology_groups",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("knowledge_base_id", sa.String(length=64), nullable=False),
        sa.Column("ontology_group_id", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["knowledge_base_id"], ["knowledge_bases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ontology_group_id"], ["ontology_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("knowledge_base_id", "ontology_group_id", name="uq_kb_ontology_group"),
    )
    op.create_index("ix_kb_ontology_groups_knowledge_base_id", "kb_ontology_groups", ["knowledge_base_id"])
    op.create_index("ix_kb_ontology_groups_ontology_group_id", "kb_ontology_groups", ["ontology_group_id"])

    op.create_table(
        "semantic_model_query_runs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("semantic_model_id", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("request", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("sql", sa.Text(), nullable=True),
        sa.Column("row_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("duration_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("ran_by", sa.String(length=512), nullable=True),
        sa.Column("ran_by_name", sa.String(length=256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["semantic_model_id"], ["semantic_models.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_semantic_model_query_runs_semantic_model_id",
        "semantic_model_query_runs",
        ["semantic_model_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_semantic_model_query_runs_semantic_model_id", table_name="semantic_model_query_runs")
    op.drop_table("semantic_model_query_runs")
    op.drop_index("ix_kb_ontology_groups_ontology_group_id", table_name="kb_ontology_groups")
    op.drop_index("ix_kb_ontology_groups_knowledge_base_id", table_name="kb_ontology_groups")
    op.drop_table("kb_ontology_groups")
    op.drop_index("ix_kb_semantic_models_semantic_model_id", table_name="kb_semantic_models")
    op.drop_index("ix_kb_semantic_models_knowledge_base_id", table_name="kb_semantic_models")
    op.drop_table("kb_semantic_models")
