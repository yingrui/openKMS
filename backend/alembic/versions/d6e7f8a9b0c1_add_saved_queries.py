"""Add saved_queries (Ossie saved queries).

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-06-08
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d6e7f8a9b0c1"
down_revision: Union[str, Sequence[str], None] = "c5d6e7f8a9b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSONB = postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    op.create_table(
        "saved_queries",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("base_dataset_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("metrics", _JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("group_by", _JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("joins", _JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("filters", _JSONB, nullable=True),
        sa.Column("exports", _JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("ai_context", _JSONB, nullable=True),
        sa.Column("created_by", sa.String(length=512), nullable=True),
        sa.Column("created_by_name", sa.String(length=256), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["base_dataset_id"], ["datasets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_saved_queries_base_dataset_id", "saved_queries", ["base_dataset_id"])


def downgrade() -> None:
    op.drop_index("ix_saved_queries_base_dataset_id", table_name="saved_queries")
    op.drop_table("saved_queries")
