"""Re-apply default patterns: the audit log gained a facets route.

Revision ID: 40750727b377
Revises: c7e0e1ca2629
"""

from __future__ import annotations

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "40750727b377"
down_revision: Union[str, Sequence[str], None] = "c7e0e1ca2629"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _reapply_patterns() -> None:
    conn = op.get_bind()
    if "security_permissions" not in sa.inspect(conn).get_table_names():
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


def upgrade() -> None:
    _reapply_patterns()


def downgrade() -> None:
    _reapply_patterns()
