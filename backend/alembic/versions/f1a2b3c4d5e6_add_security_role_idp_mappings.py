"""Add security_role_idp_mappings for OIDC realm role → app role.

Revision ID: f1a2b3c4d5e6
Revises: e8f0a1b2c3d4
Create Date: 2026-03-29

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e8f0a1b2c3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "security_role_idp_mappings" in insp.get_table_names():
        return
    op.create_table(
        "security_role_idp_mappings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("role_id", sa.String(length=36), nullable=False),
        sa.Column("external_role_name", sa.String(length=256), nullable=False),
        sa.ForeignKeyConstraint(["role_id"], ["security_roles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("external_role_name", name="uq_security_role_idp_external_name"),
    )
    op.create_index(
        op.f("ix_security_role_idp_mappings_role_id"),
        "security_role_idp_mappings",
        ["role_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_security_role_idp_mappings_role_id"), table_name="security_role_idp_mappings")
    op.drop_table("security_role_idp_mappings")
