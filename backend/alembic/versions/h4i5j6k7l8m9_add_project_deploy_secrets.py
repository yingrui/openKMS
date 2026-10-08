"""Add project_deploy_secrets table.

Revision ID: h4i5j6k7l8m9
Revises: g3h4i5j6k7l8
Create Date: 2026-10-08
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "h4i5j6k7l8m9"
down_revision: Union[str, Sequence[str], None] = "g3h4i5j6k7l8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_deploy_secrets",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("project_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=253), nullable=False),
        sa.Column("cluster_id", sa.String(length=64), nullable=True),
        sa.Column("namespace", sa.String(length=253), nullable=False, server_default="default"),
        sa.Column("key_names", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("data_encrypted", sa.Text(), nullable=False),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sync_error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["cluster_id"], ["kubernetes_clusters.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "name", name="uq_project_deploy_secrets_project_name"),
    )
    op.create_index(
        op.f("ix_project_deploy_secrets_project_id"),
        "project_deploy_secrets",
        ["project_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_project_deploy_secrets_cluster_id"),
        "project_deploy_secrets",
        ["cluster_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_project_deploy_secrets_cluster_id"), table_name="project_deploy_secrets")
    op.drop_index(op.f("ix_project_deploy_secrets_project_id"), table_name="project_deploy_secrets")
    op.drop_table("project_deploy_secrets")
