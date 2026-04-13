"""Add security roles, permissions, access groups, and resource scopes.

Revision ID: e8f0a1b2c3d4
Revises: b13ff4a1796a
Create Date: 2026-03-29

"""
from typing import Sequence, Union

import uuid

import sqlalchemy as sa
from alembic import op

from app.services.permission_catalog import ADMIN_ROLE_NAME, PERM_ALL

revision: str = "e8f0a1b2c3d4"
down_revision: Union[str, Sequence[str], None] = ("b13ff4a1796a", "a1b2c3d4e5f6")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "security_roles",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_security_roles_name"), "security_roles", ["name"], unique=True)

    op.create_table(
        "security_role_permissions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("role_id", sa.String(length=36), nullable=False),
        sa.Column("permission_key", sa.String(length=128), nullable=False),
        sa.ForeignKeyConstraint(["role_id"], ["security_roles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("role_id", "permission_key", name="uq_security_role_perm"),
    )
    op.create_index(op.f("ix_security_role_permissions_role_id"), "security_role_permissions", ["role_id"])

    op.create_table(
        "user_security_roles",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("role_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["role_id"], ["security_roles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "role_id"),
    )

    op.create_table(
        "access_groups",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_access_groups_name"), "access_groups", ["name"], unique=True)

    op.create_table(
        "access_group_users",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["access_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "group_id"),
    )

    op.create_table(
        "access_group_channels",
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.Column("channel_id", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["channel_id"], ["document_channels.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["access_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "channel_id"),
    )

    op.create_table(
        "access_group_knowledge_bases",
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.Column("knowledge_base_id", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["access_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["knowledge_base_id"], ["knowledge_bases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "knowledge_base_id"),
    )

    op.create_table(
        "access_group_evaluation_datasets",
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.Column("evaluation_dataset_id", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["evaluation_dataset_id"], ["evaluation_datasets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["access_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "evaluation_dataset_id"),
    )

    op.create_table(
        "access_group_datasets",
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["access_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "dataset_id"),
    )

    op.create_table(
        "access_group_object_types",
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.Column("object_type_id", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["access_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["object_type_id"], ["object_types.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "object_type_id"),
    )

    op.create_table(
        "access_group_link_types",
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.Column("link_type_id", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["access_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["link_type_id"], ["link_types.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "link_type_id"),
    )

    admin_role_id = str(uuid.uuid4())
    conn = op.get_bind()
    conn.execute(
        sa.text("INSERT INTO security_roles (id, name, description) VALUES (:aid, :aname, :adesc)"),
        {
            "aid": admin_role_id,
            "aname": ADMIN_ROLE_NAME,
            "adesc": "Administrator; starts with the single 'all' permission (refine in Console → Permissions)",
        },
    )
    conn.execute(
        sa.text(
            "INSERT INTO security_role_permissions (id, role_id, permission_key) "
            "VALUES (:id, :role_id, :permission_key)"
        ),
        {
            "id": str(uuid.uuid4()),
            "role_id": admin_role_id,
            "permission_key": PERM_ALL,
        },
    )

    conn.execute(
        sa.text(
            "INSERT INTO user_security_roles (user_id, role_id) "
            "SELECT id, :rid FROM users WHERE is_admin = true"
        ),
        {"rid": admin_role_id},
    )


def downgrade() -> None:
    op.drop_table("access_group_link_types")
    op.drop_table("access_group_object_types")
    op.drop_table("access_group_datasets")
    op.drop_table("access_group_evaluation_datasets")
    op.drop_table("access_group_knowledge_bases")
    op.drop_table("access_group_channels")
    op.drop_table("access_group_users")
    op.drop_index(op.f("ix_access_groups_name"), table_name="access_groups")
    op.drop_table("access_groups")
    op.drop_table("user_security_roles")
    op.drop_index(op.f("ix_security_role_permissions_role_id"), table_name="security_role_permissions")
    op.drop_table("security_role_permissions")
    op.drop_index(op.f("ix_security_roles_name"), table_name="security_roles")
    op.drop_table("security_roles")
