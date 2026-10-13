"""Grant data:read / data:write to roles that previously reached datasets.

Revision ID: e6d5c4b3a2f1
Revises: e0f1a2b3c4d5
Create Date: 2026-06-08

The three-layer split moved datasets off ``console:datasets`` / ``ontology:read``
onto ``data:read`` / ``data:write`` (migration e0f1a2b3c4d5). Roles were not
re-granted, so existing non-admin roles lost access. Backfill:

* roles with ``console:datasets`` (used to **manage** datasets) → ``data:read`` + ``data:write``
* roles with ``ontology:read`` / ``ontology:write`` (could **view** datasets) → ``data:read``

Mirrors the connectors split (u3v4w5x6y7z8). ``admin`` (``all``) already covers both.
"""

from __future__ import annotations

import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.services.permissions.permission_catalog import PERM_DATA_READ, PERM_DATA_WRITE

revision: str = "e6d5c4b3a2f1"
down_revision: Union[str, Sequence[str], None] = "e0f1a2b3c4d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _grant(conn, role_id: str, key: str) -> None:
    exists = conn.execute(
        sa.text(
            "SELECT 1 FROM security_role_permissions WHERE role_id = :r AND permission_key = :k LIMIT 1"
        ),
        {"r": role_id, "k": key},
    ).fetchone()
    if exists:
        return
    conn.execute(
        sa.text(
            "INSERT INTO security_role_permissions (id, role_id, permission_key) VALUES (:id, :r, :k)"
        ),
        {"id": str(uuid.uuid4()), "r": role_id, "k": key},
    )


def _roles_with_key(conn, key: str) -> list[str]:
    rows = conn.execute(
        sa.text("SELECT DISTINCT role_id FROM security_role_permissions WHERE permission_key = :k"),
        {"k": key},
    ).fetchall()
    return [r[0] for r in rows]


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_role_permissions" not in insp.get_table_names():
        return

    for role_id in _roles_with_key(conn, "console:datasets"):
        _grant(conn, role_id, PERM_DATA_READ)
        _grant(conn, role_id, PERM_DATA_WRITE)

    for key in ("ontology:read", "ontology:write"):
        for role_id in _roles_with_key(conn, key):
            _grant(conn, role_id, PERM_DATA_READ)


def downgrade() -> None:
    # Data-layer grants are additive and safe to keep; nothing to undo.
    pass
