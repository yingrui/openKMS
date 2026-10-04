"""Refresh console:kubernetes frontend patterns for cluster detail routes.

Revision ID: g3h4i5j6k7l8
Revises: f2a3b4c5d6e7
Create Date: 2026-10-04
"""

from __future__ import annotations

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.services.permissions.permission_catalog import PERM_CONSOLE_KUBERNETES

revision: str = "g3h4i5j6k7l8"
down_revision: Union[str, Sequence[str], None] = "f2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "security_permissions" not in insp.get_table_names():
        return

    from app.services.permissions.permission_default_patterns import default_patterns_for_key

    fe, be = default_patterns_for_key(PERM_CONSOLE_KUBERNETES)
    bind.execute(
        sa.text(
            """
            UPDATE security_permissions SET
              frontend_route_patterns = CAST(:fe AS jsonb),
              backend_api_patterns = CAST(:be AS jsonb)
            WHERE key = :k
            """
        ),
        {"fe": json.dumps(fe), "be": json.dumps(be), "k": PERM_CONSOLE_KUBERNETES},
    )


def downgrade() -> None:
    pass
