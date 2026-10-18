"""A log of mutations: what changed, by whom, and whether it worked.

Written by `AuditMiddleware` (see `app/services/audit.py`), so an endpoint cannot forget it. Also
re-applies the default patterns, because the read route is new (`GET /api/console/audit-events`).

Revision ID: c7e0e1ca2629
Revises: c8d9e0f1a2b3
"""

from __future__ import annotations

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c7e0e1ca2629"
down_revision: Union[str, Sequence[str], None] = "c8d9e0f1a2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _reapply_patterns() -> None:
    conn = op.get_bind()
    if "security_permissions" not in sa.inspect(conn).get_table_names():
        return

    from app.services.permissions.permission_catalog import OPERATION_KEY_HINTS
    from app.services.permissions.permission_default_patterns import default_patterns_for_key

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


def upgrade() -> None:
    op.create_table(
        "audit_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("actor_sub", sa.String(512), nullable=True),
        sa.Column("actor_name", sa.String(256), nullable=True),
        sa.Column("auth_mode", sa.String(16), nullable=True),
        sa.Column("method", sa.String(8), nullable=False),
        sa.Column("path", sa.String(512), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("resource_type", sa.String(64), nullable=True),
        sa.Column("resource_id", sa.String(128), nullable=True),
        sa.Column("detail", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.create_index("ix_audit_events_at", "audit_events", ["at"])
    op.create_index("ix_audit_events_actor_sub", "audit_events", ["actor_sub"])
    op.create_index("ix_audit_events_path", "audit_events", ["path"])
    op.create_index("ix_audit_events_resource_type", "audit_events", ["resource_type"])
    op.create_index("ix_audit_events_resource_id", "audit_events", ["resource_id"])
    _reapply_patterns()


def downgrade() -> None:
    op.drop_table("audit_events")
    _reapply_patterns()
