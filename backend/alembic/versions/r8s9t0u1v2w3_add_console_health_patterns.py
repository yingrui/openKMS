"""Add console health route patterns to console:access.

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
Create Date: 2026-05-23
"""

from __future__ import annotations

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.services.permission_catalog import PERM_CONSOLE_ACCESS
from app.services.permission_default_patterns import default_patterns_for_key

revision: str = "r8s9t0u1v2w3"
down_revision: Union[str, Sequence[str], None] = "q7r8s9t0u1v2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_permissions" not in insp.get_table_names():
        return
    fe, be = default_patterns_for_key(PERM_CONSOLE_ACCESS)
    conn.execute(
        sa.text(
            """
            UPDATE security_permissions SET
              frontend_route_patterns = CAST(:fe AS jsonb),
              backend_api_patterns = CAST(:be AS jsonb)
            WHERE key = :k
            """
        ),
        {"fe": json.dumps(fe), "be": json.dumps(be), "k": PERM_CONSOLE_ACCESS},
    )


def downgrade() -> None:
    pass
