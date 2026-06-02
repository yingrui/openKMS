"""Knowledge base created_by; drop knowledge map node created_by columns.

Revision ID: g7a8b9c0d1e2
Revises: f6a7b8c9d0e1
Create Date: 2026-06-02

Knowledge map does not use per-node sharing; knowledge bases do.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "g7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "knowledge_bases",
        sa.Column("created_by", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "knowledge_bases",
        sa.Column("created_by_name", sa.String(length=256), nullable=True),
    )
    op.create_index(
        op.f("ix_knowledge_bases_created_by"),
        "knowledge_bases",
        ["created_by"],
        unique=False,
    )

    op.execute(
        sa.text(
            """
            UPDATE knowledge_bases AS kb
            SET created_by = rae.grantee_id
            FROM resource_acl_entries AS rae
            WHERE rae.resource_type = 'knowledge_base'
              AND rae.resource_id = kb.id
              AND rae.grantee_type = 'user'
              AND rae.grantee_id IS NOT NULL
              AND kb.created_by IS NULL
            """
        )
    )

    op.drop_index(op.f("ix_knowledge_map_nodes_created_by"), table_name="knowledge_map_nodes")
    op.drop_column("knowledge_map_nodes", "created_by_name")
    op.drop_column("knowledge_map_nodes", "created_by")


def downgrade() -> None:
    op.add_column(
        "knowledge_map_nodes",
        sa.Column("created_by", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "knowledge_map_nodes",
        sa.Column("created_by_name", sa.String(length=256), nullable=True),
    )
    op.create_index(
        op.f("ix_knowledge_map_nodes_created_by"),
        "knowledge_map_nodes",
        ["created_by"],
        unique=False,
    )

    op.drop_index(op.f("ix_knowledge_bases_created_by"), table_name="knowledge_bases")
    op.drop_column("knowledge_bases", "created_by_name")
    op.drop_column("knowledge_bases", "created_by")
