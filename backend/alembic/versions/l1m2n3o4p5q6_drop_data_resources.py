"""Drop legacy data_resources table (replaced by resource_acl_entries).

Revision ID: l1m2n3o4p5q6
Revises: k0l1m2n3o4p5
Create Date: 2026-06-02
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "l1m2n3o4p5q6"
down_revision: Union[str, Sequence[str], None] = "k0l1m2n3o4p5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("ix_data_resources_resource_kind", table_name="data_resources")
    op.drop_table("data_resources")


def downgrade() -> None:
    op.create_table(
        "data_resources",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("resource_kind", sa.String(length=64), nullable=False),
        sa.Column("attributes", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("anchor_channel_id", sa.String(length=64), nullable=True),
        sa.Column("anchor_knowledge_base_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["anchor_channel_id"], ["document_channels.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["anchor_knowledge_base_id"], ["knowledge_bases.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_data_resources_resource_kind", "data_resources", ["resource_kind"])
