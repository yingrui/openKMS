"""notices table and notices permission rows + pattern refresh

Revision ID: p2q3r4s5t6u7
Revises: n0o1p2q3r4s5
Create Date: 2026-04-20
"""

from __future__ import annotations

import json
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "p2q3r4s5t6u7"
down_revision: Union[str, None] = "n0o1p2q3r4s5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if "notices" not in insp.get_table_names():
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

    if "security_permissions" not in insp.get_table_names():
        return

    from app.services.permission_catalog import OPERATION_KEY_HINTS
    from app.services.permission_default_patterns import default_patterns_for_key

    conn = op.get_bind()
    max_ord = conn.execute(sa.text("SELECT COALESCE(MAX(sort_order), 0) FROM security_permissions")).scalar() or 0
    ord_base = int(max_ord) + 1

    for i, hint in enumerate(OPERATION_KEY_HINTS):
        exists = conn.execute(
            sa.text("SELECT 1 FROM security_permissions WHERE key = :k LIMIT 1"),
            {"k": hint.key},
        ).fetchone()
        if exists:
            continue
        fe, be = default_patterns_for_key(hint.key)
        conn.execute(
            sa.text(
                """
                INSERT INTO security_permissions
                (id, key, label, description, frontend_route_patterns, backend_api_patterns, sort_order)
                VALUES
                (:id, :key, :label, :desc, CAST(:fe AS jsonb), CAST(:be AS jsonb), :ord)
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "key": hint.key,
                "label": hint.label,
                "desc": hint.description,
                "fe": json.dumps(fe),
                "be": json.dumps(be),
                "ord": ord_base + i,
            },
        )

    for hint in OPERATION_KEY_HINTS:
        fe, be = default_patterns_for_key(hint.key)
        conn.execute(
            sa.text(
                """
                UPDATE security_permissions SET
                  frontend_route_patterns = CAST(:fe AS jsonb),
                  backend_api_patterns = CAST(:be AS jsonb)
                WHERE key = :k
                """
            ),
            {"fe": json.dumps(fe), "be": json.dumps(be), "k": hint.key},
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    conn = op.get_bind()
    if "security_permissions" in insp.get_table_names():
        conn.execute(sa.text("DELETE FROM security_permissions WHERE key IN ('notices:read', 'notices:write')"))
    if insp.has_table("notices"):
        op.drop_table("notices")
