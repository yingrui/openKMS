"""Replace console:connectors with connectors:read and connectors:write.

Revision ID: u3v4w5x6y7z8
Revises: t2u3v4w5x6y7
Create Date: 2026-05-25
"""

from __future__ import annotations

import json
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "u3v4w5x6y7z8"
down_revision: Union[str, Sequence[str], None] = "t2u3v4w5x6y7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _upsert_security_permission(conn, key: str, label: str, desc: str, fe: list[str], be: list[str]) -> None:
    fe_json = json.dumps(fe)
    be_json = json.dumps(be)
    row = conn.execute(sa.text("SELECT id FROM security_permissions WHERE key = :k LIMIT 1"), {"k": key}).fetchone()
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
            {"label": label, "desc": desc, "fe": fe_json, "be": be_json, "k": key},
        )
        return
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
            "k": key,
            "label": label,
            "desc": desc,
            "fe": fe_json,
            "be": be_json,
            "ord": sort_order,
        },
    )


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_permissions" not in insp.get_table_names():
        return

    from app.services.permission_catalog import PERM_CONNECTORS_READ, PERM_CONNECTORS_WRITE, OPERATION_KEY_HINTS
    from app.services.permission_default_patterns import default_patterns_for_key

    hints = {h.key: h for h in OPERATION_KEY_HINTS}
    for key in (PERM_CONNECTORS_READ, PERM_CONNECTORS_WRITE):
        h = hints.get(key)
        if not h:
            continue
        fe, be = default_patterns_for_key(key)
        _upsert_security_permission(conn, key, h.label, h.description, fe, be)

    role_rows = conn.execute(
        sa.text(
            "SELECT DISTINCT role_id FROM security_role_permissions WHERE permission_key = 'console:connectors'"
        )
    ).fetchall()
    for (role_id,) in role_rows:
        for key in (PERM_CONNECTORS_READ, PERM_CONNECTORS_WRITE):
            exists = conn.execute(
                sa.text(
                    "SELECT 1 FROM security_role_permissions WHERE role_id = :r AND permission_key = :k LIMIT 1"
                ),
                {"r": role_id, "k": key},
            ).fetchone()
            if exists:
                continue
            conn.execute(
                sa.text(
                    "INSERT INTO security_role_permissions (id, role_id, permission_key) VALUES (:id, :r, :k)"
                ),
                {"id": str(uuid.uuid4()), "r": role_id, "k": key},
            )

    conn.execute(sa.text("DELETE FROM security_role_permissions WHERE permission_key = 'console:connectors'"))
    conn.execute(sa.text("DELETE FROM security_permissions WHERE key = 'console:connectors'"))


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_permissions" not in insp.get_table_names():
        return

    _KEY = "console:connectors"
    _LABEL = "Manage connectors"
    _DESC = "CRUD /api/connectors and encrypted per-kind settings (e.g. API tokens)."
    fe_json = json.dumps(["/console", "/console/connectors"])
    be_json = json.dumps(["/api/connectors/*"])

    role_rows = conn.execute(
        sa.text(
            """
            SELECT DISTINCT role_id FROM security_role_permissions
            WHERE permission_key IN ('connectors:read', 'connectors:write')
            """
        )
    ).fetchall()
    for (role_id,) in role_rows:
        has_old = conn.execute(
            sa.text(
                "SELECT 1 FROM security_role_permissions WHERE role_id = :r AND permission_key = :k LIMIT 1"
            ),
            {"r": role_id, "k": _KEY},
        ).fetchone()
        if has_old:
            continue
        conn.execute(
            sa.text(
                "INSERT INTO security_role_permissions (id, role_id, permission_key) VALUES (:id, :r, :k)"
            ),
            {"id": str(uuid.uuid4()), "r": role_id, "k": _KEY},
        )

    conn.execute(
        sa.text("DELETE FROM security_role_permissions WHERE permission_key IN ('connectors:read', 'connectors:write')")
    )
    conn.execute(sa.text("DELETE FROM security_permissions WHERE key IN ('connectors:read', 'connectors:write')"))

    row = conn.execute(sa.text("SELECT id FROM security_permissions WHERE key = :k LIMIT 1"), {"k": _KEY}).fetchone()
    if not row:
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
