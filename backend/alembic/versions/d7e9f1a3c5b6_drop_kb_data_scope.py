"""drop_kb_data_scope

A knowledge base no longer scopes Catalog semantic models or ontology groups: the concept is gone from
the app (the Data scope section was removed), so the bindings it wrote have no reader and no editor.
Dropping the tables is the honest end of that — an invisible setting is worse than none.

Revision ID: d7e9f1a3c5b6
Revises: wf3agentdesc
Create Date: 2026-11-12
"""
from typing import Sequence, Union

from alembic import op

revision: str = "d7e9f1a3c5b6"
down_revision: Union[str, None] = "wf3agentdesc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("ix_kb_ontology_groups_ontology_group_id", table_name="kb_ontology_groups")
    op.drop_index("ix_kb_ontology_groups_knowledge_base_id", table_name="kb_ontology_groups")
    op.drop_table("kb_ontology_groups")
    op.drop_index("ix_kb_semantic_models_semantic_model_id", table_name="kb_semantic_models")
    op.drop_index("ix_kb_semantic_models_knowledge_base_id", table_name="kb_semantic_models")
    op.drop_table("kb_semantic_models")


def downgrade() -> None:
    import sqlalchemy as sa

    op.create_table(
        "kb_semantic_models",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "knowledge_base_id",
            sa.String(64),
            sa.ForeignKey("knowledge_bases.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "semantic_model_id",
            sa.String(64),
            sa.ForeignKey("semantic_models.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("knowledge_base_id", "semantic_model_id", name="uq_kb_semantic_model"),
    )
    op.create_index("ix_kb_semantic_models_knowledge_base_id", "kb_semantic_models", ["knowledge_base_id"])
    op.create_index("ix_kb_semantic_models_semantic_model_id", "kb_semantic_models", ["semantic_model_id"])

    op.create_table(
        "kb_ontology_groups",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "knowledge_base_id",
            sa.String(64),
            sa.ForeignKey("knowledge_bases.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "ontology_group_id",
            sa.String(64),
            sa.ForeignKey("ontology_groups.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("knowledge_base_id", "ontology_group_id", name="uq_kb_ontology_group"),
    )
    op.create_index("ix_kb_ontology_groups_knowledge_base_id", "kb_ontology_groups", ["knowledge_base_id"])
    op.create_index("ix_kb_ontology_groups_ontology_group_id", "kb_ontology_groups", ["ontology_group_id"])
