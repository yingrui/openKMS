"""Drop require_auth_for_home from system_settings (anonymous / always shows static home).

Revision ID: w0x1y2z3a4b5
Revises: u8v9w0x1y2z3
Create Date: 2026-04-21
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "w0x1y2z3a4b5"
down_revision: Union[str, None] = "u8v9w0x1y2z3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("system_settings")} if insp.has_table("system_settings") else set()
    if "require_auth_for_home" in cols:
        op.drop_column("system_settings", "require_auth_for_home")


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("system_settings")} if insp.has_table("system_settings") else set()
    if "require_auth_for_home" not in cols:
        op.add_column(
            "system_settings",
            sa.Column("require_auth_for_home", sa.Boolean(), nullable=False, server_default="true"),
        )
