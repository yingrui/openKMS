"""Separate data-layer routes from ontology/console permissions.

Revision ID: e0f1a2b3c4d5
Revises: b8c9d0e1f2a3
Create Date: 2026-06-08

The initial three-layer IA bolted ``/datasets`` + ``/api/datasets*`` onto the
``ontology:*`` and ``console:datasets`` keys. Now that ``data:read`` /
``data:write`` own the data layer, re-apply every default pattern set so the
ontology and console keys no longer cover data-layer routes.
"""

from __future__ import annotations

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e0f1a2b3c4d5"
down_revision: Union[str, Sequence[str], None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_permissions" not in insp.get_table_names():
        return

    from app.services.permissions.permission_catalog import OPERATION_KEY_HINTS
    from app.services.permissions.permission_default_patterns import default_patterns_for_key

    for hint in OPERATION_KEY_HINTS:
        fe, be = default_patterns_for_key(hint.key)
        conn.execute(
            sa.text(
                """
                UPDATE security_permissions SET
                  frontend_route_patterns = CAST(:fe AS jsonb),
                  backend_api_patterns = CAST(:be AS jsonb)
                WHERE key = :k
                """
            ),
            {"fe": json.dumps(fe), "be": json.dumps(be), "k": hint.key},
        )


def downgrade() -> None:
    pass
