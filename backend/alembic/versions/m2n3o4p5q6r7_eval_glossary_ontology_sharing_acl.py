"""Add created_by to eval/glossary/ontology types; seed Others ACL on existing rows.

Revision ID: m2n3o4p5q6r7
Revises: l1m2n3o4p5q6
Create Date: 2026-06-02

Pre-existing evaluations, glossaries, object types, and link types receive authenticated
read+write+manage so behavior matches prior open-by-default access. New resources created
after this migration only bootstrap the owner grant (no Others row).
"""
from typing import Sequence, Union
import uuid

import sqlalchemy as sa
from alembic import op

revision: str = "m2n3o4p5q6r7"
down_revision: Union[str, Sequence[str], None] = "l1m2n3o4p5q6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PERM_RWM = 1 | 2 | 4

TABLES = (
    ("evaluation", "evaluations"),
    ("glossary", "glossaries"),
    ("object_type", "object_types"),
    ("link_type", "link_types"),
)


def _add_created_by(table: str) -> None:
    op.add_column(table, sa.Column("created_by", sa.String(length=512), nullable=True))
    op.add_column(table, sa.Column("created_by_name", sa.String(length=256), nullable=True))
    op.create_index(op.f(f"ix_{table}_created_by"), table, ["created_by"], unique=False)


def _drop_created_by(table: str) -> None:
    op.drop_index(op.f(f"ix_{table}_created_by"), table_name=table)
    op.drop_column(table, "created_by_name")
    op.drop_column(table, "created_by")


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
    for table in ("evaluations", "glossaries", "object_types", "link_types"):
        _add_created_by(table)
    conn = op.get_bind()
    for resource_type, table in TABLES:
        _seed_others(conn, resource_type, table)


def downgrade() -> None:
    conn = op.get_bind()
    for resource_type, _table in TABLES:
        conn.execute(
            sa.text(
                "DELETE FROM resource_acl_entries "
                "WHERE resource_type = :rtype "
                "AND grantee_type = 'authenticated' "
                "AND permissions = :perm"
            ),
            {"rtype": resource_type, "perm": PERM_RWM},
        )
    for table in ("link_types", "object_types", "glossaries", "evaluations"):
        _drop_created_by(table)
