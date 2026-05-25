"""Rename Knowledge Map API paths and permission / toggle keys (taxonomy → knowledge_map).

Revision ID: m5n6o7p8q9r0
Revises: k9m0n1o2p3q4
Create Date: 2026-05-20

- ``feature_toggles.key``: ``taxonomy`` → ``knowledge_map``
- ``security_permissions.key``: ``taxonomy:read`` / ``taxonomy:write`` → ``knowledge_map:read`` / ``knowledge_map:write``
- JSON pattern arrays: ``/api/taxonomy`` → ``/api/knowledge-map`` in ``backend_api_patterns`` for those rows

When both old and new permission keys exist (e.g. catalog seed added ``knowledge_map:*`` before this rename),
role links are merged and the legacy ``taxonomy:*`` rows are removed instead of renaming into a duplicate key.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m5n6o7p8q9r0"
down_revision: Union[str, Sequence[str], None] = "k9m0n1o2p3q4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _merge_permission_key(conn: sa.Connection, old_key: str, new_key: str, *, has_role_perms: bool) -> None:
    old_id = conn.execute(
        sa.text("SELECT id FROM security_permissions WHERE key = :k LIMIT 1"),
        {"k": old_key},
    ).fetchone()
    new_id = conn.execute(
        sa.text("SELECT id FROM security_permissions WHERE key = :k LIMIT 1"),
        {"k": new_key},
    ).fetchone()
    if not old_id:
        return
    if new_id:
        if has_role_perms:
            conn.execute(
                sa.text(
                    """
                    DELETE FROM security_role_permissions AS srp
                    WHERE srp.permission_key = :old
                      AND EXISTS (
                        SELECT 1 FROM security_role_permissions AS srp2
                        WHERE srp2.role_id = srp.role_id AND srp2.permission_key = :new
                      )
                    """
                ),
                {"old": old_key, "new": new_key},
            )
            conn.execute(
                sa.text(
                    "UPDATE security_role_permissions SET permission_key = :new WHERE permission_key = :old"
                ),
                {"old": old_key, "new": new_key},
            )
        conn.execute(
            sa.text("DELETE FROM security_permissions WHERE key = :k"),
            {"k": old_key},
        )
        return
    conn.execute(
        sa.text("UPDATE security_permissions SET key = :new WHERE key = :old"),
        {"old": old_key, "new": new_key},
    )


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "security_permissions" not in insp.get_table_names():
        if "feature_toggles" in insp.get_table_names():
            conn.execute(sa.text("UPDATE feature_toggles SET key = 'knowledge_map' WHERE key = 'taxonomy'"))
        return

    has_role_perms = "security_role_permissions" in insp.get_table_names()

    conn.execute(
        sa.text("""
            UPDATE security_permissions
            SET backend_api_patterns = replace(backend_api_patterns::text, '/api/taxonomy', '/api/knowledge-map')::jsonb
            WHERE key IN ('taxonomy:read', 'taxonomy:write', 'knowledge_map:read', 'knowledge_map:write')
        """)
    )
    _merge_permission_key(conn, "taxonomy:read", "knowledge_map:read", has_role_perms=has_role_perms)
    _merge_permission_key(conn, "taxonomy:write", "knowledge_map:write", has_role_perms=has_role_perms)

    if "feature_toggles" in insp.get_table_names():
        conn.execute(sa.text("UPDATE feature_toggles SET key = 'knowledge_map' WHERE key = 'taxonomy'"))


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "feature_toggles" in insp.get_table_names():
        conn.execute(sa.text("UPDATE feature_toggles SET key = 'taxonomy' WHERE key = 'knowledge_map'"))
    if "security_permissions" not in insp.get_table_names():
        return
    conn.execute(
        sa.text("""
            UPDATE security_permissions
            SET backend_api_patterns = replace(backend_api_patterns::text, '/api/knowledge-map', '/api/taxonomy')::jsonb
            WHERE key IN ('knowledge_map:read', 'knowledge_map:write')
        """)
    )
    conn.execute(sa.text("UPDATE security_permissions SET key = 'taxonomy:read' WHERE key = 'knowledge_map:read'"))
    conn.execute(sa.text("UPDATE security_permissions SET key = 'taxonomy:write' WHERE key = 'knowledge_map:write'"))
