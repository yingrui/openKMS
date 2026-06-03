"""Add created_by to datasets; seed Others ACL on existing rows.

Revision ID: n3o4p5q6r7s8
Revises: m2n3o4p5q6r7
Create Date: 2026-06-02

Pre-existing datasets receive authenticated read+write+manage. New datasets only
bootstrap the owner grant (no Others row).
"""
from typing import Sequence, Union
import uuid

import sqlalchemy as sa
from alembic import op

revision: str = "n3o4p5q6r7s8"
down_revision: Union[str, Sequence[str], None] = "m2n3o4p5q6r7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PERM_RWM = 1 | 2 | 4


def upgrade() -> None:
    op.add_column("datasets", sa.Column("created_by", sa.String(length=512), nullable=True))
    op.add_column("datasets", sa.Column("created_by_name", sa.String(length=256), nullable=True))
    op.create_index(op.f("ix_datasets_created_by"), "datasets", ["created_by"], unique=False)

    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id FROM datasets")).fetchall()
    for (resource_id,) in rows:
        exists = conn.execute(
            sa.text(
                "SELECT 1 FROM resource_acl_entries "
                "WHERE resource_type = 'dataset' "
                "AND resource_id = :rid AND grantee_type = 'authenticated' "
                "LIMIT 1"
            ),
            {"rid": resource_id},
        ).fetchone()
        if exists:
            continue
        conn.execute(
            sa.text(
                "INSERT INTO resource_acl_entries "
                "(id, resource_type, resource_id, grantee_type, grantee_id, permissions) "
                "VALUES (:id, 'dataset', :rid, 'authenticated', NULL, :perm) "
                "ON CONFLICT ON CONSTRAINT uq_resource_acl_grantee DO NOTHING"
            ),
            {"id": str(uuid.uuid4()), "rid": resource_id, "perm": PERM_RWM},
        )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text("DELETE FROM resource_acl_entries WHERE resource_type = 'dataset'")
    )
    op.drop_index(op.f("ix_datasets_created_by"), table_name="datasets")
    op.drop_column("datasets", "created_by_name")
    op.drop_column("datasets", "created_by")
