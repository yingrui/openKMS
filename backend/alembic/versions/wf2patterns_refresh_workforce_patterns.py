"""Refresh knowledge-base permission patterns for the Workforce routes.

Revision ID: wf2patterns
Revises: wf1agents
Create Date: 2026-11-18

`/api/workforce/*` and `/workforce*` were added to the knowledge-base key defaults, but only the
Python defaults changed — an existing database keeps the patterns it seeded. This rewrites the two
keys from `permission_default_patterns` so strict mode covers the new surface.

Adding the keys to a role or group is a separate, deliberate act; this migration touches patterns only.
"""

from __future__ import annotations

import json
from typing import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "wf2patterns"
down_revision: Sequence[str] | str = "wf1agents"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if "security_permissions" not in sa.inspect(bind).get_table_names():
        return

    from app.services.identity.permissions.permission_catalog import PERM_KB_READ, PERM_KB_WRITE
    from app.services.identity.permissions.permission_default_patterns import default_patterns_for_key

    for key in (PERM_KB_READ, PERM_KB_WRITE):
        fe, be = default_patterns_for_key(key)
        bind.execute(
            sa.text(
                """
                UPDATE security_permissions SET
                  frontend_route_patterns = CAST(:fe AS jsonb),
                  backend_api_patterns = CAST(:be AS jsonb)
                WHERE key = :k
                """
            ),
            {"fe": json.dumps(fe), "be": json.dumps(be), "k": key},
        )


def downgrade() -> None:
    """Patterns are refreshed from code defaults; there is nothing meaningful to restore."""
