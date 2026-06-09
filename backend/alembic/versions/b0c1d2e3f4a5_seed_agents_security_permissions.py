"""Upsert security_permissions rows for projects:read / projects:write (Agents).

Revision ID: b0c1d2e3f4a5
Revises: 49ffe0ff9fd9
Create Date: 2026-06-05

Agents operation keys were added to OPERATION_KEY_HINTS after the catalog backfill
migrations; this inserts missing rows and refreshes default route/API patterns.
"""

from __future__ import annotations

import json
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.services.permission_catalog import PERM_PROJECTS_READ, PERM_PROJECTS_WRITE

revision: str = "b0c1d2e3f4a5"
down_revision: Union[str, Sequence[str], None] = "49ffe0ff9fd9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_AGENT_KEYS = (PERM_PROJECTS_READ, PERM_PROJECTS_WRITE)


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_permissions" not in insp.get_table_names():
        return

    from app.services.permission_catalog import OPERATION_KEY_HINTS
    from app.services.permission_default_patterns import default_patterns_for_key

    hints_by_key = {h.key: h for h in OPERATION_KEY_HINTS}

    for key in _AGENT_KEYS:
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
                {
                    "label": hint.label,
                    "desc": hint.description,
                    "fe": fe_json,
                    "be": be_json,
                    "k": key,
                },
            )
        else:
            max_ord = conn.execute(
                sa.text("SELECT COALESCE(MAX(sort_order), -1) FROM security_permissions")
            ).scalar()
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
                    "label": hint.label,
                    "desc": hint.description,
                    "fe": fe_json,
                    "be": be_json,
                    "ord": sort_order,
                },
            )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_permissions" not in insp.get_table_names():
        return
    conn.execute(
        sa.text("DELETE FROM security_permissions WHERE key IN (:r, :w)"),
        {"r": PERM_PROJECTS_READ, "w": PERM_PROJECTS_WRITE},
    )
