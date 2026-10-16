"""Rename the Explorer to Data Insights: the table, the grants, the paths.

Revision ID: b1c2d3e4f5a7
Revises: a1b2c3d4e5f9
Create Date: 2026-10-16

The app is **Data Insights** now, so nothing should still be called an explorer: not the table it
stores, not the permission keys an admin grants, not the API path a client calls. "Explorer" also had
a second problem — the app never explored anything (the data browsing is in the Catalog), and
**Object Explorer** already means something else.

* `explorer_dashboards` → `dashboards`
* permission keys `explorer:read` / `explorer:write` → `insights:read` / `insights:write`, with the
  **existing grants carried over** so nobody loses access to their dashboards
* both keys' patterns re-applied from Python, because the SPA paths (`/data-insights`) and the API path
  (`/api/dashboards`) changed with them
"""

from __future__ import annotations

import json
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.services.permissions.permission_catalog import PERM_INSIGHTS_READ, PERM_INSIGHTS_WRITE

revision: str = "b1c2d3e4f5a7"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_RENAMED_KEYS = {
    "explorer:read": PERM_INSIGHTS_READ,
    "explorer:write": PERM_INSIGHTS_WRITE,
}


def _upsert_permission(conn: sa.engine.Connection, hint, fe: list[str], be: list[str]) -> None:
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
            "fe": json.dumps(fe),
            "be": json.dumps(be),
            "k": hint.key,
        },
    )


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    tables = set(insp.get_table_names())

    if "explorer_dashboards" in tables and "dashboards" not in tables:
        op.rename_table("explorer_dashboards", "dashboards")

    if "security_permissions" not in tables:
        return
    from app.services.permissions.permission_catalog import OPERATION_KEY_HINTS
    from app.services.permissions.permission_default_patterns import default_patterns_for_key

    hints = {h.key: h for h in OPERATION_KEY_HINTS}
    role_permissions = "security_role_permissions" in tables
    for old_key, new_key in _RENAMED_KEYS.items():
        existing = conn.execute(
            sa.text("SELECT 1 FROM security_permissions WHERE key = :k"), {"k": old_key}
        ).fetchone()
        hint = hints.get(new_key)
        if not existing or hint is None:
            continue
        # Insert the new key beside the old one, move the grants, then drop the old key: an FK (or a
        # role that still points at it) must never see a missing permission.
        max_ord = conn.execute(
            sa.text("SELECT COALESCE(MAX(sort_order), -1) FROM security_permissions")
        ).scalar()
        row = conn.execute(
            sa.text("SELECT id FROM security_permissions WHERE key = :k"), {"k": new_key}
        ).fetchone()
        if row is None:
            fe, be = default_patterns_for_key(new_key)
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
                    "id": uuid.uuid4().hex,
                    "k": new_key,
                    "label": hint.label,
                    "desc": hint.description,
                    "fe": json.dumps(list(fe)),
                    "be": json.dumps(list(be)),
                    "ord": int(max_ord) + 1,
                },
            )
        else:
            fe, be = default_patterns_for_key(new_key)
            _upsert_permission(conn, hint, list(fe), list(be))
        if role_permissions:
            conn.execute(
                sa.text(
                    "UPDATE security_role_permissions SET permission_key = :new"
                    " WHERE permission_key = :old"
                ),
                {"new": new_key, "old": old_key},
            )
        conn.execute(sa.text("DELETE FROM security_permissions WHERE key = :k"), {"k": old_key})


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    tables = set(insp.get_table_names())
    if "dashboards" in tables and "explorer_dashboards" not in tables:
        op.rename_table("dashboards", "explorer_dashboards")
    if "security_permissions" not in tables:
        return
    for old_key, new_key in _RENAMED_KEYS.items():
        conn.execute(
            sa.text("UPDATE security_permissions SET key = :old WHERE key = :new"),
            {"old": old_key, "new": new_key},
        )
        if "security_role_permissions" in tables:
            conn.execute(
                sa.text(
                    "UPDATE security_role_permissions SET permission_key = :old"
                    " WHERE permission_key = :new"
                ),
                {"old": old_key, "new": new_key},
            )
