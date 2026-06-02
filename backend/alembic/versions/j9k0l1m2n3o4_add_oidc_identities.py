"""Add oidc_identities directory (sub → username), backfill from API keys.

Revision ID: j9k0l1m2n3o4
Revises: i8j9k0l1m2n3
Create Date: 2026-06-02
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "j9k0l1m2n3o4"
down_revision: Union[str, Sequence[str], None] = "i8j9k0l1m2n3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "oidc_identities",
        sa.Column("sub", sa.String(length=512), nullable=False),
        sa.Column("preferred_username", sa.String(length=256), nullable=False, server_default=""),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("name", sa.String(length=256), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("sub"),
    )
    op.create_index("ix_oidc_identities_preferred_username", "oidc_identities", ["preferred_username"])
    op.create_index("ix_oidc_identities_email", "oidc_identities", ["email"])

    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            INSERT INTO oidc_identities (
                sub, preferred_username, email, name, first_seen_at, last_seen_at, created_at, updated_at
            )
            SELECT DISTINCT ON (owner_sub)
                owner_sub,
                COALESCE(NULLIF(TRIM(display_username), ''), 'user'),
                NULLIF(TRIM(display_email), ''),
                NULLIF(TRIM(display_username), ''),
                created_at,
                COALESCE(last_used_at, created_at),
                created_at,
                NOW()
            FROM user_api_keys
            WHERE auth_mode = 'oidc'
              AND owner_sub IS NOT NULL
              AND TRIM(owner_sub) <> ''
            ORDER BY owner_sub, created_at DESC
            ON CONFLICT (sub) DO NOTHING
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_oidc_identities_email", table_name="oidc_identities")
    op.drop_index("ix_oidc_identities_preferred_username", table_name="oidc_identities")
    op.drop_table("oidc_identities")
