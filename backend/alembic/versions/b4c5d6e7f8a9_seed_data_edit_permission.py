"""Seed data:edit + grant it to roles that manage datasets; refresh patterns.

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-06-08
"""

from __future__ import annotations

import json
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.services.permissions.permission_catalog import PERM_DATA_EDIT, PERM_DATA_WRITE

revision: str = "b4c5d6e7f8a9"
down_revision: Union[str, Sequence[str], None] = "a3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _upsert_permission(conn) -> None:
    from app.services.permissions.permission_catalog import OPERATION_KEY_HINTS
    from app.services.permissions.permission_default_patterns import default_patterns_for_key

    hint = next((h for h in OPERATION_KEY_HINTS if h.key == PERM_DATA_EDIT), None)
    if hint is None:
        return
    fe, be = default_patterns_for_key(PERM_DATA_EDIT)
    fe_json, be_json = json.dumps(fe), json.dumps(be)
    row = conn.execute(
        sa.text("SELECT id FROM security_permissions WHERE key = :k LIMIT 1"), {"k": PERM_DATA_EDIT}
    ).fetchone()
    if row:
        conn.execute(
            sa.text(
                """
                UPDATE security_permissions SET
                  label = :label, description = :desc,
                  frontend_route_patterns = CAST(:fe AS jsonb),
                  backend_api_patterns = CAST(:be AS jsonb)
                WHERE key = :k
                """
            ),
            {"label": hint.label, "desc": hint.description, "fe": fe_json, "be": be_json, "k": PERM_DATA_EDIT},
        )
        return
    max_ord = conn.execute(sa.text("SELECT COALESCE(MAX(sort_order), -1) FROM security_permissions")).scalar()
    conn.execute(
        sa.text(
            """
            INSERT INTO security_permissions
            (id, key, label, description, frontend_route_patterns, backend_api_patterns, sort_order)
            VALUES (:id, :k, :label, :desc, CAST(:fe AS jsonb), CAST(:be AS jsonb), :ord)
            """
        ),
        {
            "id": str(uuid.uuid4()),
            "k": PERM_DATA_EDIT,
            "label": hint.label,
            "desc": hint.description,
            "fe": fe_json,
            "be": be_json,
            "ord": int(max_ord) + 1,
        },
    )


def _refresh_all_patterns(conn) -> None:
    from app.services.permissions.permission_catalog import OPERATION_KEY_HINTS
    from app.services.permissions.permission_default_patterns import default_patterns_for_key

    for h in OPERATION_KEY_HINTS:
        fe, be = default_patterns_for_key(h.key)
        conn.execute(
            sa.text(
                """
                UPDATE security_permissions SET
                  frontend_route_patterns = CAST(:fe AS jsonb),
                  backend_api_patterns = CAST(:be AS jsonb)
                WHERE key = :k
                """
            ),
            {"fe": json.dumps(fe), "be": json.dumps(be), "k": h.key},
        )


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_permissions" not in insp.get_table_names():
        return

    _upsert_permission(conn)
    # Roles that already manage datasets inherit row-editing.
    role_rows = conn.execute(
        sa.text("SELECT DISTINCT role_id FROM security_role_permissions WHERE permission_key = :k"),
        {"k": PERM_DATA_WRITE},
    ).fetchall()
    for (role_id,) in role_rows:
        exists = conn.execute(
            sa.text(
                "SELECT 1 FROM security_role_permissions WHERE role_id = :r AND permission_key = :k LIMIT 1"
            ),
            {"r": role_id, "k": PERM_DATA_EDIT},
        ).fetchone()
        if not exists:
            conn.execute(
                sa.text("INSERT INTO security_role_permissions (id, role_id, permission_key) VALUES (:id, :r, :k)"),
                {"id": str(uuid.uuid4()), "r": role_id, "k": PERM_DATA_EDIT},
            )
    _refresh_all_patterns(conn)


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_permissions" not in insp.get_table_names():
        return
    conn.execute(sa.text("DELETE FROM security_role_permissions WHERE permission_key = :k"), {"k": PERM_DATA_EDIT})
    conn.execute(sa.text("DELETE FROM security_permissions WHERE key = :k"), {"k": PERM_DATA_EDIT})
