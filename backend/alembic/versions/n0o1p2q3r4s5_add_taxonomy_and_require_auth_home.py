"""taxonomy tables, require_auth_for_home, taxonomy permission rows + pattern refresh

Revision ID: n0o1p2q3r4s5
Revises: m8n9o0p1q2r4
Create Date: 2026-04-20
"""

from __future__ import annotations

import json
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "n0o1p2q3r4s5"
down_revision: Union[str, None] = "m8n9o0p1q2r4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if "system_settings" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("system_settings")}
        if "require_auth_for_home" not in cols:
            op.add_column(
                "system_settings",
                sa.Column("require_auth_for_home", sa.Boolean(), nullable=False, server_default="false"),
            )

    if "taxonomy_nodes" not in insp.get_table_names():
        op.create_table(
            "taxonomy_nodes",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("parent_id", sa.String(64), sa.ForeignKey("taxonomy_nodes.id", ondelete="CASCADE"), nullable=True),
            sa.Column("name", sa.String(256), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_taxonomy_nodes_parent_id", "taxonomy_nodes", ["parent_id"])

    if "taxonomy_resource_links" not in insp.get_table_names():
        op.create_table(
            "taxonomy_resource_links",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column(
                "taxonomy_node_id",
                sa.String(64),
                sa.ForeignKey("taxonomy_nodes.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("resource_type", sa.String(32), nullable=False),
            sa.Column("resource_id", sa.String(64), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.UniqueConstraint("resource_type", "resource_id", name="uq_taxonomy_resource_links_type_id"),
        )
        op.create_index("ix_taxonomy_resource_links_taxonomy_node_id", "taxonomy_resource_links", ["taxonomy_node_id"])

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

    if "feature_toggles" in insp.get_table_names():
        conn.execute(
            sa.text(
                """
                INSERT INTO feature_toggles (key, enabled)
                SELECT 'taxonomy', true
                WHERE NOT EXISTS (SELECT 1 FROM feature_toggles WHERE key = 'taxonomy')
                """
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    conn = op.get_bind()

    if "feature_toggles" in insp.get_table_names():
        conn.execute(sa.text("DELETE FROM feature_toggles WHERE key = 'taxonomy'"))

    if "security_permissions" in insp.get_table_names():
        conn.execute(sa.text("DELETE FROM security_permissions WHERE key IN ('taxonomy:read', 'taxonomy:write')"))

    if insp.has_table("taxonomy_resource_links"):
        op.drop_table("taxonomy_resource_links")
    if insp.has_table("taxonomy_nodes"):
        op.drop_table("taxonomy_nodes")

    if "system_settings" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("system_settings")}
        if "require_auth_for_home" in cols:
            op.drop_column("system_settings", "require_auth_for_home")
