"""Add created_by_name to document and article channels.

Revision ID: c3d4e5f6a7b0
Revises: b2c3d4e5f6a9
Create Date: 2026-06-01

Stores human-readable creator username at channel create time (OIDC preferred_username
or local username) for sharing UI labels.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6a7b0"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "document_channels",
        sa.Column("created_by_name", sa.String(length=256), nullable=True),
    )
    op.add_column(
        "article_channels",
        sa.Column("created_by_name", sa.String(length=256), nullable=True),
    )
    op.execute(
        sa.text(
            """
            UPDATE document_channels AS dc
            SET created_by_name = u.username
            FROM users AS u
            WHERE dc.created_by = u.id
              AND dc.created_by_name IS NULL
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE article_channels AS ac
            SET created_by_name = u.username
            FROM users AS u
            WHERE ac.created_by = u.id
              AND ac.created_by_name IS NULL
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE document_channels AS dc
            SET created_by_name = sub.display_username
            FROM (
                SELECT DISTINCT ON (owner_sub) owner_sub, display_username
                FROM user_api_keys
                WHERE display_username <> ''
                ORDER BY owner_sub, created_at DESC
            ) AS sub
            WHERE dc.created_by = sub.owner_sub
              AND dc.created_by_name IS NULL
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE article_channels AS ac
            SET created_by_name = sub.display_username
            FROM (
                SELECT DISTINCT ON (owner_sub) owner_sub, display_username
                FROM user_api_keys
                WHERE display_username <> ''
                ORDER BY owner_sub, created_at DESC
            ) AS sub
            WHERE ac.created_by = sub.owner_sub
              AND ac.created_by_name IS NULL
            """
        )
    )


def downgrade() -> None:
    op.drop_column("article_channels", "created_by_name")
    op.drop_column("document_channels", "created_by_name")
