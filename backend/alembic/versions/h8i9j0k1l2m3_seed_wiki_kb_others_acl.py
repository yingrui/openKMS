"""Seed others (authenticated) rwm ACL on existing wiki spaces and knowledge bases.

Revision ID: h8i9j0k1l2m3
Revises: g7a8b9c0d1e2
Create Date: 2026-06-02

Pre-existing wiki spaces and knowledge bases receive authenticated read+write+manage
so behavior matches prior open-by-default access. New spaces/bases created after this
migration only bootstrap the owner grant (no Others row) — non-owners need explicit grants.
"""
from typing import Sequence, Union
import uuid

import sqlalchemy as sa
from alembic import op

revision: str = "h8i9j0k1l2m3"
down_revision: Union[str, Sequence[str], None] = "g7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PERM_RWM = 1 | 2 | 4


def _seed_others(conn, resource_type: str, table: str) -> None:
    rows = conn.execute(sa.text(f"SELECT id FROM {table}")).fetchall()
    for (resource_id,) in rows:
        exists = conn.execute(
            sa.text(
                "SELECT 1 FROM resource_acl_entries "
                "WHERE resource_type = :rtype "
                "AND resource_id = :rid AND grantee_type = 'authenticated' "
                "LIMIT 1"
            ),
            {"rtype": resource_type, "rid": resource_id},
        ).fetchone()
        if exists:
            continue
        conn.execute(
            sa.text(
                "INSERT INTO resource_acl_entries "
                "(id, resource_type, resource_id, grantee_type, grantee_id, permissions) "
                "VALUES (:id, :rtype, :rid, 'authenticated', NULL, :perm) "
                "ON CONFLICT ON CONSTRAINT uq_resource_acl_grantee DO NOTHING"
            ),
            {
                "id": str(uuid.uuid4()),
                "rtype": resource_type,
                "rid": resource_id,
                "perm": PERM_RWM,
            },
        )


def upgrade() -> None:
    conn = op.get_bind()
    _seed_others(conn, "wiki_space", "wiki_spaces")
    _seed_others(conn, "knowledge_base", "knowledge_bases")


def downgrade() -> None:
    conn = op.get_bind()
    for resource_type in ("wiki_space", "knowledge_base"):
        conn.execute(
            sa.text(
                "DELETE FROM resource_acl_entries "
                "WHERE resource_type = :rtype "
                "AND grantee_type = 'authenticated' "
                "AND permissions = :perm"
            ),
            {"rtype": resource_type, "perm": PERM_RWM},
        )
