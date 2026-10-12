"""Add dataset_joins table (data-engineering ER joins between datasets).

Revision ID: a9b8c7d6e5f4
Revises: f3b2a1c4d5e6
Create Date: 2026-06-08
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a9b8c7d6e5f4"
down_revision: Union[str, Sequence[str], None] = "f3b2a1c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dataset_joins",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=True),
        sa.Column("source_dataset_id", sa.String(length=64), nullable=False),
        sa.Column("target_dataset_id", sa.String(length=64), nullable=False),
        sa.Column("cardinality", sa.String(length=16), nullable=False),
        sa.Column(
            "join_columns",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=512), nullable=True),
        sa.Column("created_by_name", sa.String(length=256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["source_dataset_id"], ["datasets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_dataset_id"], ["datasets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "source_dataset_id <> target_dataset_id",
            name="ck_dataset_joins_distinct_datasets",
        ),
    )
    op.create_index("ix_dataset_joins_source_dataset_id", "dataset_joins", ["source_dataset_id"])
    op.create_index("ix_dataset_joins_target_dataset_id", "dataset_joins", ["target_dataset_id"])


def downgrade() -> None:
    op.drop_table("dataset_joins")
