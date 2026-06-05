"""Add projects, user git credentials, agents feature toggle.

Revision ID: t9u0v1w2x3y4
Revises: s8t9u0v1w2x3
Create Date: 2026-06-05
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "t9u0v1w2x3y4"
down_revision: Union[str, Sequence[str], None] = "s8t9u0v1w2x3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("user_sub", sa.String(256), nullable=False, index=True),
        sa.Column("name", sa.String(512), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("slug", sa.String(128), nullable=False),
        sa.Column("settings", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("git_initialized", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "user_git_credentials",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("user_sub", sa.String(256), nullable=False, index=True),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("label", sa.String(128), nullable=False),
        sa.Column("username", sa.String(256), nullable=False),
        sa.Column("encrypted_pat", sa.Text(), nullable=False),
        sa.Column("scopes_hint", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO feature_toggles (key, enabled) SELECT 'agents', true "
            "WHERE NOT EXISTS (SELECT 1 FROM feature_toggles WHERE key = 'agents')"
        )
    )


def downgrade() -> None:
    op.drop_table("user_git_credentials")
    op.drop_table("projects")
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM feature_toggles WHERE key = 'agents'"))
