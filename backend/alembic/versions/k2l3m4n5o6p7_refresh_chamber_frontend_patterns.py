"""Refresh ontology frontend patterns for the Chamber route.

Revision ID: k2l3m4n5o6p7
Revises: 7d3f9a1c2e5b
Create Date: 2026-11-10
"""

from __future__ import annotations

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "k2l3m4n5o6p7"
down_revision: Union[str, Sequence[str], None] = "7d3f9a1c2e5b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "security_permissions" not in insp.get_table_names():
        return

    from app.services.identity.permissions.permission_catalog import PERM_ONTOLOGY_READ, PERM_ONTOLOGY_WRITE
    from app.services.identity.permissions.permission_default_patterns import default_patterns_for_key

    for key in (PERM_ONTOLOGY_READ, PERM_ONTOLOGY_WRITE):
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
    pass
