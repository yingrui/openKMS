"""Seed data:read / data:write permissions (data layer).

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-06-08

Adds the data-layer operation keys to the permission catalog and refreshes their
default route/API patterns. Insert-or-update, mirroring b0c1d2e3f4a5.
"""

from __future__ import annotations

import json
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.services.permissions.permission_catalog import PERM_DATA_READ, PERM_DATA_WRITE

revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, Sequence[str], None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_DATA_KEYS = (PERM_DATA_READ, PERM_DATA_WRITE)


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_permissions" not in insp.get_table_names():
        return

    from app.services.permissions.permission_catalog import OPERATION_KEY_HINTS
    from app.services.permissions.permission_default_patterns import default_patterns_for_key

    hints_by_key = {h.key: h for h in OPERATION_KEY_HINTS}

    for key in _DATA_KEYS:
        hint = hints_by_key.get(key)
        if not hint:
            continue
        fe, be = default_patterns_for_key(key)
        fe_json = json.dumps(fe)
        be_json = json.dumps(be)
        row = conn.execute(
            sa.text("SELECT id FROM security_permissions WHERE key = :k LIMIT 1"),
            {"k": key},
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
                {"label": hint.label, "desc": hint.description, "fe": fe_json, "be": be_json, "k": key},
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
                    "k": key,
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
        sa.text("DELETE FROM security_permissions WHERE key IN (:r, :w)"),
        {"r": PERM_DATA_READ, "w": PERM_DATA_WRITE},
    )
