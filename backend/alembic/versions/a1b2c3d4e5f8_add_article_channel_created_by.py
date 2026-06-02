"""Add article_channels.created_by (nullable).

Revision ID: a1b2c3d4e5f8
Revises: z8a9b0c1d2e4
Create Date: 2026-06-01

Stores the identity subject of whoever created the channel. Backfill from owner ACL
grants where present.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f8"
down_revision: Union[str, Sequence[str], None] = "z8a9b0c1d2e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "article_channels",
        sa.Column("created_by", sa.String(length=512), nullable=True),
    )
    op.create_index(
        op.f("ix_article_channels_created_by"),
        "article_channels",
        ["created_by"],
        unique=False,
    )
    op.execute(
        sa.text(
            """
            UPDATE article_channels AS ac
            SET created_by = rae.grantee_id
            FROM resource_acl_entries AS rae
            WHERE rae.resource_type = 'article_channel'
              AND rae.resource_id = ac.id
              AND rae.grantee_type = 'user'
              AND rae.grantee_id IS NOT NULL
              AND ac.created_by IS NULL
            """
        )
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_article_channels_created_by"), table_name="article_channels")
    op.drop_column("article_channels", "created_by")
