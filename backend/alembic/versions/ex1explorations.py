"""explorations: saved object sets and their layouts

Revision ID: ex1explorations
Revises: 8b7aeb068564
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "ex1explorations"
down_revision = "8b7aeb068564"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "explorations",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column(
            "object_type_id",
            sa.String(64),
            sa.ForeignKey("object_types.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "filters",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "layout",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("visibility", sa.String(16), nullable=False, server_default="private"),
        sa.Column("owner_sub", sa.String(512), nullable=True, index=True),
        sa.Column("owner_name", sa.String(256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_explorations_owner_type", "explorations", ["owner_sub", "object_type_id"]
    )

    op.create_table(
        "exploration_layouts",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "object_type_id",
            sa.String(64),
            sa.ForeignKey("object_types.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("owner_sub", sa.String(512), nullable=False, server_default=""),
        sa.Column(
            "layout",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint(
            "object_type_id", "owner_sub", name="uq_exploration_layouts_type_owner"
        ),
    )


def downgrade() -> None:
    op.drop_table("exploration_layouts")
    op.drop_index("ix_explorations_owner_type", table_name="explorations")
    op.drop_table("explorations")
