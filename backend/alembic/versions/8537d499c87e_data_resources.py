"""Catalog data resources, semantic-model access mode, query audit resource id.

Revision ID: 8537d499c87e
Revises: d8e9f0a1b2c3
Create Date: 2026-11-04

A **data resource** is the access capability operators grant in Data Security: a named
slice of one semantic model, optionally carrying a row policy. Models gain an explicit
`access_mode` so “public” (anyone with `data:read`) and “restricted” (resource grant required)
are states of the model rather than an inference from resource rows.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "8537d499c87e"
down_revision: Union[str, Sequence[str], None] = "d8e9f0a1b2c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "data_resources",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("semantic_model_id", sa.String(length=64), nullable=False),
        sa.Column("base_dataset_id", sa.String(length=64), nullable=True),
        sa.Column(
            "row_policy",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
        sa.Column("created_by", sa.String(length=512), nullable=True),
        sa.Column("created_by_name", sa.String(length=256), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["semantic_model_id"], ["semantic_models.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_data_resources_semantic_model_id"),
        "data_resources",
        ["semantic_model_id"],
        unique=False,
    )

    op.add_column(
        "semantic_models",
        sa.Column(
            "access_mode",
            sa.String(length=16),
            nullable=False,
            server_default="public",
        ),
    )

    op.add_column(
        "semantic_model_query_runs",
        sa.Column("data_resource_id", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("semantic_model_query_runs", "data_resource_id")
    op.drop_column("semantic_models", "access_mode")
    op.drop_index(op.f("ix_data_resources_semantic_model_id"), table_name="data_resources")
    op.drop_table("data_resources")
