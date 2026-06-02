"""Seed others (authenticated) rwm ACL on existing article channels.

Revision ID: b2c3d4e5f6a9
Revises: a1b2c3d4e5f8
Create Date: 2026-06-01

Pre-existing article channels receive authenticated read+write+manage so behavior
matches prior open-by-default access. New channels created after this migration
only bootstrap the owner grant (no Others row) — non-owners need explicit grants.
"""
from typing import Sequence, Union
import uuid

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a9"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PERM_RWM = 1 | 2 | 4


def upgrade() -> None:
    conn = op.get_bind()
    channels = conn.execute(sa.text("SELECT id FROM article_channels")).fetchall()
    for (channel_id,) in channels:
        exists = conn.execute(
            sa.text(
                "SELECT 1 FROM resource_acl_entries "
                "WHERE resource_type = 'article_channel' "
                "AND resource_id = :cid AND grantee_type = 'authenticated' "
                "LIMIT 1"
            ),
            {"cid": channel_id},
        ).fetchone()
        if exists:
            continue
        conn.execute(
            sa.text(
                "INSERT INTO resource_acl_entries "
                "(id, resource_type, resource_id, grantee_type, grantee_id, permissions) "
                "VALUES (:id, 'article_channel', :cid, 'authenticated', NULL, :perm) "
                "ON CONFLICT ON CONSTRAINT uq_resource_acl_grantee DO NOTHING"
            ),
            {"id": str(uuid.uuid4()), "cid": channel_id, "perm": PERM_RWM},
        )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "DELETE FROM resource_acl_entries "
            "WHERE resource_type = 'article_channel' "
            "AND grantee_type = 'authenticated' "
            "AND permissions = :perm"
        ),
        {"perm": PERM_RWM},
    )
