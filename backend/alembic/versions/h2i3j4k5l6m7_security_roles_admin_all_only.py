"""Admin role: only 'all' permission; remove seeded member role.

Revision ID: h2i3j4k5l6m7
Revises: f1a2b3c4d5e6
Create Date: 2026-03-29

"""
from typing import Sequence, Union

import uuid

import sqlalchemy as sa
from alembic import op

revision: str = "h2i3j4k5l6m7"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    admin_id = conn.execute(sa.text("SELECT id FROM security_roles WHERE name = 'admin' LIMIT 1")).scalar()
    if admin_id:
        conn.execute(
            sa.text("DELETE FROM security_role_permissions WHERE role_id = :rid"),
            {"rid": admin_id},
        )
        conn.execute(
            sa.text(
                "INSERT INTO security_role_permissions (id, role_id, permission_key) "
                "VALUES (:id, :rid, 'all')"
            ),
            {"id": str(uuid.uuid4()), "rid": admin_id},
        )

    member_id = conn.execute(sa.text("SELECT id FROM security_roles WHERE name = 'member' LIMIT 1")).scalar()
    if member_id:
        conn.execute(
            sa.text("DELETE FROM user_security_roles WHERE role_id = :rid"),
            {"rid": member_id},
        )
        conn.execute(
            sa.text("DELETE FROM security_role_idp_mappings WHERE role_id = :rid"),
            {"rid": member_id},
        )
        conn.execute(
            sa.text("DELETE FROM security_role_permissions WHERE role_id = :rid"),
            {"rid": member_id},
        )
        conn.execute(
            sa.text("DELETE FROM security_roles WHERE id = :rid"),
            {"rid": member_id},
        )


def downgrade() -> None:
    pass
