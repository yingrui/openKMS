"""Rename Knowledge Map API paths and permission / toggle keys (taxonomy → knowledge_map).

Revision ID: m5n6o7p8q9r0
Revises: k9m0n1o2p3q4
Create Date: 2026-05-20

- ``feature_toggles.key``: ``taxonomy`` → ``knowledge_map``
- ``security_permissions.key``: ``taxonomy:read`` / ``taxonomy:write`` → ``knowledge_map:read`` / ``knowledge_map:write``
- JSON pattern arrays: ``/api/taxonomy`` → ``/api/knowledge-map`` in ``backend_api_patterns`` for those rows
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m5n6o7p8q9r0"
down_revision: Union[str, Sequence[str], None] = "k9m0n1o2p3q4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text("""
            UPDATE security_permissions
            SET backend_api_patterns = replace(backend_api_patterns::text, '/api/taxonomy', '/api/knowledge-map')::jsonb
            WHERE key IN ('taxonomy:read', 'taxonomy:write')
        """)
    )
    conn.execute(sa.text("UPDATE security_permissions SET key = 'knowledge_map:read' WHERE key = 'taxonomy:read'"))
    conn.execute(sa.text("UPDATE security_permissions SET key = 'knowledge_map:write' WHERE key = 'taxonomy:write'"))
    conn.execute(sa.text("UPDATE feature_toggles SET key = 'knowledge_map' WHERE key = 'taxonomy'"))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE feature_toggles SET key = 'taxonomy' WHERE key = 'knowledge_map'"))
    conn.execute(
        sa.text("""
            UPDATE security_permissions
            SET backend_api_patterns = replace(backend_api_patterns::text, '/api/knowledge-map', '/api/taxonomy')::jsonb
            WHERE key IN ('knowledge_map:read', 'knowledge_map:write')
        """)
    )
    conn.execute(sa.text("UPDATE security_permissions SET key = 'taxonomy:read' WHERE key = 'knowledge_map:read'"))
    conn.execute(sa.text("UPDATE security_permissions SET key = 'taxonomy:write' WHERE key = 'knowledge_map:write'"))
