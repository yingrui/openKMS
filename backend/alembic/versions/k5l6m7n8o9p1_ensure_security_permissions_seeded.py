"""Ensure security_permissions rows exist; guarantee ``all`` is present.

Revision ID: k5l6m7n8o9p1
Revises: i3j4k5l6m7n8
Create Date: 2026-03-29

Repairs databases where ``security_permissions`` existed empty (e.g. metadata
create_all before Alembic) so the prior revision skipped inserts. Also inserts
only the ``all`` row if the table is non-empty but ``all`` was removed.
"""

from __future__ import annotations

import json
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.services.permission_catalog import PERM_ALL
from app.services.permission_seed import default_permission_seed_rows

revision: str = "k5l6m7n8o9p1"
down_revision: Union[str, Sequence[str], None] = "i3j4k5l6m7n8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_permissions" not in insp.get_table_names():
        return

    n = conn.execute(sa.text("SELECT COUNT(*) FROM security_permissions")).scalar()
    if not n or int(n) == 0:
        for i, row in enumerate(default_permission_seed_rows()):
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
                    "key": row["key"],
                    "label": row["label"],
                    "desc": row.get("description") or None,
                    "fe": json.dumps(row["frontend_route_patterns"]),
                    "be": json.dumps(row["backend_api_patterns"]),
                    "ord": i,
                },
            )
        return

    has_all = conn.execute(
        sa.text("SELECT 1 FROM security_permissions WHERE key = :k LIMIT 1"),
        {"k": PERM_ALL},
    ).fetchone()
    if has_all:
        return

    all_row = next(r for r in default_permission_seed_rows() if r["key"] == PERM_ALL)
    conn.execute(sa.text("UPDATE security_permissions SET sort_order = sort_order + 1"))
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
            "key": all_row["key"],
            "label": all_row["label"],
            "desc": all_row.get("description") or None,
            "fe": json.dumps(all_row["frontend_route_patterns"]),
            "be": json.dumps(all_row["backend_api_patterns"]),
            "ord": 0,
        },
    )


def downgrade() -> None:
    pass
