"""Add console:storage permission for object storage manager."""

from __future__ import annotations

import json
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.services.permission_catalog import OPERATION_KEY_HINTS, PERM_CONSOLE_STORAGE
from app.services.permission_default_patterns import default_patterns_for_key

revision: str = "n8o9p0q1r2s3"
down_revision: Union[str, Sequence[str], None] = "m7n8o9p0q1r2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_permissions" not in insp.get_table_names():
        return
    hint = next((h for h in OPERATION_KEY_HINTS if h.key == PERM_CONSOLE_STORAGE), None)
    if not hint:
        return
    fe, be = default_patterns_for_key(PERM_CONSOLE_STORAGE)
    fe_json = json.dumps(fe)
    be_json = json.dumps(be)
    row = conn.execute(
        sa.text("SELECT id FROM security_permissions WHERE key = :k LIMIT 1"),
        {"k": PERM_CONSOLE_STORAGE},
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
                "k": PERM_CONSOLE_STORAGE,
            },
        )
    else:
        max_ord = conn.execute(
            sa.text("SELECT COALESCE(MAX(sort_order), -1) FROM security_permissions")
        ).scalar()
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
                "k": PERM_CONSOLE_STORAGE,
                "label": hint.label,
                "desc": hint.description,
                "fe": fe_json,
                "be": be_json,
                "ord": int(max_ord) + 1,
            },
        )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_permissions" not in insp.get_table_names():
        return
    conn.execute(
        sa.text("DELETE FROM security_permissions WHERE key = :k"),
        {"k": PERM_CONSOLE_STORAGE},
    )
