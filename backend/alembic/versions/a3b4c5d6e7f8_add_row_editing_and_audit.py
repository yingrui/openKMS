"""Add dataset primary_key_columns / is_editable + dataset_edits audit table.

Revision ID: a3b4c5d6e7f8
Revises: e6d5c4b3a2f1
Create Date: 2026-06-08
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a3b4c5d6e7f8"
down_revision: Union[str, Sequence[str], None] = "e6d5c4b3a2f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSONB = postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    op.add_column("datasets", sa.Column("primary_key_columns", _JSONB, nullable=True))
    op.add_column(
        "datasets",
        sa.Column("is_editable", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_table(
        "dataset_edits",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=False),
        sa.Column("op", sa.String(length=16), nullable=False),
        sa.Column("pk", _JSONB, nullable=True),
        sa.Column("before", _JSONB, nullable=True),
        sa.Column("after", _JSONB, nullable=True),
        sa.Column("actor", sa.String(length=512), nullable=True),
        sa.Column("actor_name", sa.String(length=256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_dataset_edits_dataset_id", "dataset_edits", ["dataset_id"])


def downgrade() -> None:
    op.drop_table("dataset_edits")
    op.drop_column("datasets", "is_editable")
    op.drop_column("datasets", "primary_key_columns")
