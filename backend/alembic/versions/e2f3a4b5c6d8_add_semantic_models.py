"""Add semantic_models (named scope) + membership; attach metrics/queries to a model.

Revision ID: e2f3a4b5c6d8
Revises: d1e2f3a4b5c7
Create Date: 2026-06-08

A semantic model is a named scope over the shared data layer (datasets, fields,
relationships stay Catalog-owned). Metrics and queries belong to exactly one
model. Existing metrics/queries are attached to an auto-created "Default model".
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e2f3a4b5c6d8"
down_revision: Union[str, Sequence[str], None] = "d1e2f3a4b5c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSONB = postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    op.create_table(
        "semantic_models",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("ai_context", _JSONB, nullable=True),
        sa.Column("created_by", sa.String(length=512), nullable=True),
        sa.Column("created_by_name", sa.String(length=256), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute("INSERT INTO semantic_models (id, name) VALUES ('default', 'Default model')")

    op.create_table(
        "semantic_model_datasets",
        sa.Column("semantic_model_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["semantic_model_id"], ["semantic_models.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("semantic_model_id", "dataset_id"),
    )
    op.create_index(
        "ix_semantic_model_datasets_semantic_model_id",
        "semantic_model_datasets",
        ["semantic_model_id"],
    )
    op.create_index(
        "ix_semantic_model_datasets_dataset_id", "semantic_model_datasets", ["dataset_id"]
    )

    for table in ("metric_definitions", "saved_queries"):
        op.add_column(table, sa.Column("semantic_model_id", sa.String(length=64), nullable=True))
        op.execute(f"UPDATE {table} SET semantic_model_id = 'default'")
        op.alter_column(table, "semantic_model_id", nullable=False)
        op.create_foreign_key(
            f"{table}_semantic_model_id_fkey",
            table,
            "semantic_models",
            ["semantic_model_id"],
            ["id"],
            ondelete="CASCADE",
        )
        op.create_index(f"ix_{table}_semantic_model_id", table, ["semantic_model_id"])

    # The default model covers every existing dataset.
    op.execute(
        "INSERT INTO semantic_model_datasets (semantic_model_id, dataset_id) "
        "SELECT 'default', id FROM datasets"
    )


def downgrade() -> None:
    for table in ("metric_definitions", "saved_queries"):
        op.drop_index(f"ix_{table}_semantic_model_id", table_name=table)
        op.drop_constraint(f"{table}_semantic_model_id_fkey", table, type_="foreignkey")
        op.drop_column(table, "semantic_model_id")

    op.drop_index("ix_semantic_model_datasets_dataset_id", table_name="semantic_model_datasets")
    op.drop_index(
        "ix_semantic_model_datasets_semantic_model_id", table_name="semantic_model_datasets"
    )
    op.drop_table("semantic_model_datasets")
    op.drop_table("semantic_models")
