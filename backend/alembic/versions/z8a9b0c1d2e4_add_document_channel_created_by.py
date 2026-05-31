"""Add document_channels.created_by (nullable).

Revision ID: z8a9b0c1d2e4
Revises: y7z8a9b0c1d2
Create Date: 2026-05-30

Stores the identity subject of whoever created the channel. Existing rows stay NULL
unless a matching user ACL grant exists (backfill).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "z8a9b0c1d2e4"
down_revision: Union[str, Sequence[str], None] = "y7z8a9b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "document_channels",
        sa.Column("created_by", sa.String(length=512), nullable=True),
    )
    op.create_index(
        op.f("ix_document_channels_created_by"),
        "document_channels",
        ["created_by"],
        unique=False,
    )
    op.execute(
        sa.text(
            """
            UPDATE document_channels AS dc
            SET created_by = rae.grantee_id
            FROM resource_acl_entries AS rae
            WHERE rae.resource_type = 'document_channel'
              AND rae.resource_id = dc.id
              AND rae.grantee_type = 'user'
              AND rae.grantee_id IS NOT NULL
              AND dc.created_by IS NULL
            """
        )
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_document_channels_created_by"), table_name="document_channels")
    op.drop_column("document_channels", "created_by")
