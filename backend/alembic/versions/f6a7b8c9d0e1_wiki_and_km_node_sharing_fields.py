"""Add created_by fields for wiki spaces and knowledge map nodes.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-02

Supports owner bootstrap and sharing UI default owner display.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, Sequence[str], None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "wiki_spaces",
        sa.Column("created_by", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "wiki_spaces",
        sa.Column("created_by_name", sa.String(length=256), nullable=True),
    )
    op.create_index(op.f("ix_wiki_spaces_created_by"), "wiki_spaces", ["created_by"], unique=False)

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

    op.execute(
        sa.text(
            """
            UPDATE wiki_spaces AS ws
            SET created_by = rae.grantee_id
            FROM resource_acl_entries AS rae
            WHERE rae.resource_type = 'wiki_space'
              AND rae.resource_id = ws.id
              AND rae.grantee_type = 'user'
              AND rae.grantee_id IS NOT NULL
              AND ws.created_by IS NULL
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE knowledge_map_nodes AS km
            SET created_by = rae.grantee_id
            FROM resource_acl_entries AS rae
            WHERE rae.resource_type = 'knowledge_map_node'
              AND rae.resource_id = km.id
              AND rae.grantee_type = 'user'
              AND rae.grantee_id IS NOT NULL
              AND km.created_by IS NULL
            """
        )
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_knowledge_map_nodes_created_by"), table_name="knowledge_map_nodes")
    op.drop_column("knowledge_map_nodes", "created_by_name")
    op.drop_column("knowledge_map_nodes", "created_by")
    op.drop_index(op.f("ix_wiki_spaces_created_by"), table_name="wiki_spaces")
    op.drop_column("wiki_spaces", "created_by_name")
    op.drop_column("wiki_spaces", "created_by")
