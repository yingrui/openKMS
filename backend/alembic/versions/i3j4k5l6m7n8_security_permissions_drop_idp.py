"""security_permissions catalog; drop security_role_idp_mappings.

Revision ID: i3j4k5l6m7n8
Revises: h2i3j4k5l6m7
Create Date: 2026-03-29

"""
from __future__ import annotations

import json
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

from app.services.permission_seed import default_permission_seed_rows

revision: str = "i3j4k5l6m7n8"
down_revision: Union[str, Sequence[str], None] = "h2i3j4k5l6m7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _seed_security_permissions_if_empty(conn) -> None:
    """Insert catalog rows when the table has no rows (includes key ``all`` first in seed order)."""
    n = conn.execute(sa.text("SELECT COUNT(*) FROM security_permissions")).scalar()
    if n and int(n) > 0:
        return
    for i, row in enumerate(default_permission_seed_rows()):
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
                "key": row["key"],
                "label": row["label"],
                "desc": row.get("description") or None,
                "fe": json.dumps(row["frontend_route_patterns"]),
                "be": json.dumps(row["backend_api_patterns"]),
                "ord": i,
            },
        )


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "security_permissions" not in insp.get_table_names():
        op.create_table(
            "security_permissions",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("key", sa.String(length=128), nullable=False),
            sa.Column("label", sa.String(length=512), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column(
                "frontend_route_patterns",
                JSONB(),
                nullable=False,
                server_default=sa.text("'[]'::jsonb"),
            ),
            sa.Column(
                "backend_api_patterns",
                JSONB(),
                nullable=False,
                server_default=sa.text("'[]'::jsonb"),
            ),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("key", name="uq_security_permissions_key"),
        )

    conn = op.get_bind()
    if "security_permissions" in sa.inspect(conn).get_table_names():
        _seed_security_permissions_if_empty(conn)

    if "security_role_idp_mappings" in insp.get_table_names():
        op.drop_index(op.f("ix_security_role_idp_mappings_role_id"), table_name="security_role_idp_mappings")
        op.drop_table("security_role_idp_mappings")


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "security_role_idp_mappings" not in insp.get_table_names():
        op.create_table(
            "security_role_idp_mappings",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("role_id", sa.String(length=36), nullable=False),
            sa.Column("external_role_name", sa.String(length=256), nullable=False),
            sa.ForeignKeyConstraint(["role_id"], ["security_roles.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("external_role_name", name="uq_security_role_idp_external_name"),
        )
        op.create_index(
            op.f("ix_security_role_idp_mappings_role_id"),
            "security_role_idp_mappings",
            ["role_id"],
            unique=False,
        )
    if "security_permissions" in insp.get_table_names():
        op.drop_table("security_permissions")
