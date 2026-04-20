"""Remove notices table and notices:* permission catalog rows.

Revision ID: u8v9w0x1y2z3
Revises: q3r4s5t6u7v8
Create Date: 2026-04-20

Downgrade only recreates an empty ``notices`` table (schema); it does not restore
permission rows—use a DB backup if you need a full rollback.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "u8v9w0x1y2z3"
down_revision: Union[str, None] = "q3r4s5t6u7v8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)

    if "security_role_permissions" in insp.get_table_names():
        conn.execute(
            sa.text(
                "DELETE FROM security_role_permissions WHERE permission_key IN ('notices:read', 'notices:write')"
            )
        )
    if "security_permissions" in insp.get_table_names():
        conn.execute(sa.text("DELETE FROM security_permissions WHERE key IN ('notices:read', 'notices:write')"))
    if insp.has_table("notices"):
        op.drop_table("notices")


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "notices" in insp.get_table_names():
        return
    op.create_table(
        "notices",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("level", sa.String(32), nullable=False, server_default="info"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
