"""Set require_auth_for_home default to true (DB + existing row).

Revision ID: q3r4s5t6u7v8
Revises: p2q3r4s5t6u7
Create Date: 2026-04-20

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "q3r4s5t6u7v8"
down_revision = "p2q3r4s5t6u7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("UPDATE system_settings SET require_auth_for_home = true"))
    op.alter_column(
        "system_settings",
        "require_auth_for_home",
        existing_type=sa.Boolean(),
        nullable=False,
        server_default=sa.text("true"),
        existing_server_default=sa.text("false"),
    )


def downgrade() -> None:
    op.alter_column(
        "system_settings",
        "require_auth_for_home",
        existing_type=sa.Boolean(),
        nullable=False,
        server_default=sa.text("false"),
        existing_server_default=sa.text("true"),
    )
