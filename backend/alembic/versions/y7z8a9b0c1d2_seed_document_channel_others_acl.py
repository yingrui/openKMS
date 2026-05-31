"""Seed others (authenticated) rwm ACL on existing document channels.

Revision ID: y7z8a9b0c1d2
Revises: x6y7z8a9b0c1
Create Date: 2026-05-30

New channels get owner-only bootstrap with empty others; pre-existing channels
receive authenticated read+write+manage so behavior matches open-by-default.
"""
from typing import Sequence, Union
import uuid

import sqlalchemy as sa
from alembic import op

revision: str = "y7z8a9b0c1d2"
down_revision: Union[str, Sequence[str], None] = "x6y7z8a9b0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PERM_RWM = 1 | 2 | 4


def upgrade() -> None:
    conn = op.get_bind()
    channels = conn.execute(sa.text("SELECT id FROM document_channels")).fetchall()
    for (channel_id,) in channels:
        exists = conn.execute(
            sa.text(
                "SELECT 1 FROM resource_acl_entries "
                "WHERE resource_type = 'document_channel' "
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
                "VALUES (:id, 'document_channel', :cid, 'authenticated', NULL, :perm) "
                "ON CONFLICT ON CONSTRAINT uq_resource_acl_grantee DO NOTHING"
            ),
            {"id": str(uuid.uuid4()), "cid": channel_id, "perm": PERM_RWM},
        )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "DELETE FROM resource_acl_entries "
            "WHERE resource_type = 'document_channel' "
            "AND grantee_type = 'authenticated' "
            "AND permissions = :perm"
        ),
        {"perm": PERM_RWM},
    )
