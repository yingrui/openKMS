"""Add connectors table and console:connectors permission.

Revision ID: s1t2u3v4w5x6
Revises: r8s9t0u1v2w3
Create Date: 2026-05-25
"""

from __future__ import annotations

import json
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "s1t2u3v4w5x6"
down_revision: Union[str, Sequence[str], None] = "r8s9t0u1v2w3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "connectors",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("settings", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("secrets_encrypted", sa.Text(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_connectors_kind"), "connectors", ["kind"], unique=False)

    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_permissions" not in insp.get_table_names():
        return

    # Historical seed: later migration u3v4w5x6y7z8 replaces this key with connectors:read / connectors:write.
    _KEY = "console:connectors"
    _LABEL = "Manage connectors"
    _DESC = "CRUD /api/connectors and encrypted per-kind settings (e.g. API tokens)."
    fe_json = json.dumps(["/console", "/console/connectors"])
    be_json = json.dumps(["/api/connectors/*"])
    row = conn.execute(sa.text("SELECT id FROM security_permissions WHERE key = :k LIMIT 1"), {"k": _KEY}).fetchone()
    if row:
        conn.execute(
            sa.text(
                """
                UPDATE security_permissions SET
                  label = :label,
                  description = :desc,
                  frontend_route_patterns = CAST(:fe AS jsonb),
                  backend_api_patterns = CAST(:be AS jsonb)
                WHERE key = :k
                """
            ),
            {"label": _LABEL, "desc": _DESC, "fe": fe_json, "be": be_json, "k": _KEY},
        )
    else:
        max_ord = conn.execute(sa.text("SELECT COALESCE(MAX(sort_order), -1) FROM security_permissions")).scalar()
        sort_order = int(max_ord) + 1
        conn.execute(
            sa.text(
                """
                INSERT INTO security_permissions
                (id, key, label, description, frontend_route_patterns, backend_api_patterns, sort_order)
                VALUES
                (:id, :k, :label, :desc, CAST(:fe AS jsonb), CAST(:be AS jsonb), :ord)
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "k": _KEY,
                "label": _LABEL,
                "desc": _DESC,
                "fe": fe_json,
                "be": be_json,
                "ord": sort_order,
            },
        )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_permissions" in insp.get_table_names():
        conn.execute(sa.text("DELETE FROM security_permissions WHERE key = :k"), {"k": "console:connectors"})
    op.drop_index(op.f("ix_connectors_kind"), table_name="connectors")
    op.drop_table("connectors")
