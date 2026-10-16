"""Split Data Explorer reports onto explorer:read / explorer:write.

Revision ID: b3c4d5e6f7a8
Revises: a8f7e6d5c4b3
Create Date: 2026-10-16

The Data Explorer used to ride on ``data:read`` / ``data:write``, so an analysis and the dataset it
was derived from were the same grant. They are not the same thing: a data steward manages tables and
does not need saved analyses; an analyst reads analyses and should not get dataset management.

* seed ``explorer:read`` / ``explorer:write``, **and re-apply the patterns of the two keys they
  were split out of** (``data:read`` / ``data:write`` shrank; the Python module alone never updates
  existing rows)
* **backfill**: every role that reached the Explorer through ``data:read`` / ``data:write`` keeps
  reaching it — access is never silently revoked by a permission split.

Rerunnable: pattern rows are upserted and grants are inserted only when missing.
"""

from __future__ import annotations

import json
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.services.permissions.permission_catalog import (
    PERM_DATA_READ,
    PERM_DATA_WRITE,
    PERM_EXPLORER_READ,
    PERM_EXPLORER_WRITE,
)

revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, Sequence[str], None] = "a8f7e6d5c4b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_NEW_KEYS = (PERM_EXPLORER_READ, PERM_EXPLORER_WRITE)
#: Keys whose **existing** rows must be re-applied too: their patterns shrank in the Python module.
_REFRESH = (PERM_DATA_READ, PERM_DATA_WRITE)
#: The grant each new key stands in for, so nobody loses access.
_BACKFILL = ((PERM_DATA_READ, PERM_EXPLORER_READ), (PERM_DATA_WRITE, PERM_EXPLORER_WRITE))


def _upsert_permission(conn: sa.engine.Connection, hint, fe: list[str], be: list[str]) -> None:
    row = conn.execute(
        sa.text("SELECT id FROM security_permissions WHERE key = :k LIMIT 1"), {"k": hint.key}
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
                "fe": json.dumps(fe),
                "be": json.dumps(be),
                "k": hint.key,
            },
        )
        return
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
            "k": hint.key,
            "label": hint.label,
            "desc": hint.description,
            "fe": json.dumps(fe),
            "be": json.dumps(be),
            "ord": int(max_ord) + 1,
        },
    )


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_permissions" not in insp.get_table_names():
        return

    from app.services.permissions.permission_catalog import OPERATION_KEY_HINTS
    from app.services.permissions.permission_default_patterns import default_patterns_for_key

    hints = {h.key: h for h in OPERATION_KEY_HINTS}
    for key in (*_NEW_KEYS, *_REFRESH):
        hint = hints.get(key)
        if hint is None:
            continue
        fe, be = default_patterns_for_key(key)
        _upsert_permission(conn, hint, list(fe), list(be))

    if "security_role_permissions" not in insp.get_table_names():
        return
    for old_key, new_key in _BACKFILL:
        roles = conn.execute(
            sa.text(
                "SELECT DISTINCT role_id FROM security_role_permissions WHERE permission_key = :k"
            ),
            {"k": old_key},
        ).fetchall()
        for (role_id,) in roles:
            covered = conn.execute(
                sa.text(
                    "SELECT 1 FROM security_role_permissions"
                    " WHERE role_id = :r AND permission_key IN (:np, 'all') LIMIT 1"
                ),
                {"r": role_id, "np": new_key},
            ).fetchone()
            if covered:
                continue
            conn.execute(
                sa.text(
                    "INSERT INTO security_role_permissions (id, role_id, permission_key)"
                    " VALUES (:id, :r, :k)"
                ),
                {"id": str(uuid.uuid4()), "r": role_id, "k": new_key},
            )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_permissions" not in insp.get_table_names():
        return
    if "security_role_permissions" in insp.get_table_names():
        conn.execute(
            sa.text("DELETE FROM security_role_permissions WHERE permission_key IN (:r, :w)"),
            {"r": PERM_EXPLORER_READ, "w": PERM_EXPLORER_WRITE},
        )
    conn.execute(
        sa.text("DELETE FROM security_permissions WHERE key IN (:r, :w)"),
        {"r": PERM_EXPLORER_READ, "w": PERM_EXPLORER_WRITE},
    )
