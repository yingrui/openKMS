"""add user_api_keys table for personal API tokens

Revision ID: p9q0r1s2t3u4
Revises: f1e2d3c4b5a6
Create Date: 2026-05-06

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "p9q0r1s2t3u4"
down_revision: Union[str, None] = "f1e2d3c4b5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_api_keys",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("owner_sub", sa.String(length=512), nullable=False),
        sa.Column("auth_mode", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("key_prefix", sa.String(length=32), nullable=False),
        sa.Column("secret_hash", sa.Text(), nullable=False),
        sa.Column("oidc_realm_roles", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("display_username", sa.String(length=256), nullable=False),
        sa.Column("display_email", sa.String(length=320), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_api_keys_owner_sub"), "user_api_keys", ["owner_sub"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_api_keys_owner_sub"), table_name="user_api_keys")
    op.drop_table("user_api_keys")
