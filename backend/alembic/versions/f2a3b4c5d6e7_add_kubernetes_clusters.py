"""Add kubernetes_clusters table and console:kubernetes permission.

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-10-04
"""

from __future__ import annotations

import json
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.services.permissions.permission_catalog import PERM_CONSOLE_KUBERNETES

revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, Sequence[str], None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "kubernetes_clusters",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("default_namespace", sa.String(length=256), nullable=False, server_default="default"),
        sa.Column("api_server", sa.String(length=1024), nullable=True),
        sa.Column("kubeconfig_encrypted", sa.Text(), nullable=False),
        sa.Column("options", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_test_ok", sa.Boolean(), nullable=True),
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

    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_permissions" not in insp.get_table_names():
        return

    from app.services.permissions.permission_catalog import OPERATION_KEY_HINTS
    from app.services.permissions.permission_default_patterns import default_patterns_for_key

    hints_by_key = {h.key: h for h in OPERATION_KEY_HINTS}
    hint = hints_by_key.get(PERM_CONSOLE_KUBERNETES)
    if not hint:
        return

    fe, be = default_patterns_for_key(PERM_CONSOLE_KUBERNETES)
    fe_json = json.dumps(fe)
    be_json = json.dumps(be)
    row = conn.execute(
        sa.text("SELECT id FROM security_permissions WHERE key = :k LIMIT 1"),
        {"k": PERM_CONSOLE_KUBERNETES},
    ).fetchone()
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
            {
                "label": hint.label,
                "desc": hint.description,
                "fe": fe_json,
                "be": be_json,
                "k": PERM_CONSOLE_KUBERNETES,
            },
        )
    else:
        max_ord = conn.execute(
            sa.text("SELECT COALESCE(MAX(sort_order), -1) FROM security_permissions")
        ).scalar()
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
                "k": PERM_CONSOLE_KUBERNETES,
                "label": hint.label,
                "desc": hint.description,
                "fe": fe_json,
                "be": be_json,
                "ord": sort_order,
            },
        )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_permissions" in insp.get_table_names():
        conn.execute(
            sa.text("DELETE FROM security_permissions WHERE key = :k"),
            {"k": PERM_CONSOLE_KUBERNETES},
        )
    op.drop_table("kubernetes_clusters")
