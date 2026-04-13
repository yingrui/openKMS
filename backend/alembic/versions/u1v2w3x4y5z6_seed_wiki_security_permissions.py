"""Upsert security_permissions rows for wikis:read / wikis:write (strict patterns).

Revision ID: u1v2w3x4y5z6
Revises: z8a9b0c1d2e3
Create Date: 2026-04-13
"""

from __future__ import annotations

import json
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "u1v2w3x4y5z6"
down_revision: Union[str, Sequence[str], None] = "z8a9b0c1d2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_permissions" not in insp.get_table_names():
        return

    from app.services.permission_catalog import OPERATION_KEY_HINTS
    from app.services.permission_default_patterns import default_patterns_for_key

    for hint in OPERATION_KEY_HINTS:
        fe, be = default_patterns_for_key(hint.key)
        if not fe and not be:
            continue
        fe_json = json.dumps(fe)
        be_json = json.dumps(be)
        row = conn.execute(
            sa.text("SELECT id FROM security_permissions WHERE key = :k LIMIT 1"),
            {"k": hint.key},
        ).fetchone()
        if row:
            conn.execute(
                sa.text(
                    """
                    UPDATE security_permissions SET
                      frontend_route_patterns = CAST(:fe AS jsonb),
                      backend_api_patterns = CAST(:be AS jsonb)
                    WHERE key = :k
                    """
                ),
                {"fe": fe_json, "be": be_json, "k": hint.key},
            )
        else:
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
                    "k": hint.key,
                    "label": hint.label,
                    "desc": hint.description,
                    "fe": fe_json,
                    "be": be_json,
                    "ord": sort_order,
                },
            )


def downgrade() -> None:
    pass
