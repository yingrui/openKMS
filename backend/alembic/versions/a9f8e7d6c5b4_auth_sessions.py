"""Add server-side auth sessions for the BFF auth path.

Revision ID: c9d0e1f2a3b4
Revises: b8bcb67aff92
Create Date: 2026-11-11
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a9f8e7d6c5b4"
down_revision: Union[str, Sequence[str], None] = "b8bcb67aff92"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.String(length=128), primary_key=True),
        sa.Column("user_sub", sa.String(length=512), nullable=False),
        sa.Column("idp_sub", sa.String(length=512), nullable=True),
        sa.Column("auth_mode", sa.String(length=16), nullable=False),
        sa.Column("access_token_enc", sa.Text(), nullable=False),
        sa.Column("refresh_token_enc", sa.Text(), nullable=True),
        sa.Column("access_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("idle_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("absolute_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rotated_from", sa.String(length=128), nullable=True),
    )
    op.create_index("ix_auth_sessions_user_sub", "auth_sessions", ["user_sub"], unique=False)
    op.create_index("ix_auth_sessions_idle_expires_at", "auth_sessions", ["idle_expires_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_auth_sessions_idle_expires_at", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_user_sub", table_name="auth_sessions")
    op.drop_table("auth_sessions")
