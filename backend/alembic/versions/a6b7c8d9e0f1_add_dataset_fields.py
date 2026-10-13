"""Add dataset_fields (the Ossie semantic field layer).

Revision ID: a6b7c8d9e0f1
Revises: f8e7d6c5b4a3
Create Date: 2026-06-08
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a6b7c8d9e0f1"
down_revision: Union[str, Sequence[str], None] = "f8e7d6c5b4a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSONB = postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    op.create_table(
        "dataset_fields",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("column_name", sa.String(length=256), nullable=True),
        sa.Column("expression", _JSONB, nullable=True),
        sa.Column("datatype", sa.String(length=32), nullable=True),
        sa.Column("dimension", _JSONB, nullable=True),
        sa.Column("ai_context", _JSONB, nullable=True),
        sa.Column("ordinal", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by", sa.String(length=512), nullable=True),
        sa.Column("created_by_name", sa.String(length=256), nullable=True),
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
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dataset_id", "name", name="uq_dataset_fields_dataset_name"),
    )
    op.create_index("ix_dataset_fields_dataset_id", "dataset_fields", ["dataset_id"])


def downgrade() -> None:
    op.drop_index("ix_dataset_fields_dataset_id", table_name="dataset_fields")
    op.drop_table("dataset_fields")
