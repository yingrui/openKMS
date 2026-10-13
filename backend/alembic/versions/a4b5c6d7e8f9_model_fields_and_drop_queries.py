"""Fields become model-scoped; drop saved_queries.

- New `semantic_model_fields` (model-scoped fields: column ref / expression + role +
  ai_context); migrate every `dataset_fields` row to **each model** that covers its
  dataset, then drop `dataset_fields`.
- New `dataset_columns` (maintained column annotations — today: description).
- Drop `saved_queries` — a query is a Data-Explorer (consumption) concern, not part
  of the Ossie semantic model (datasets / fields / metrics / relationships).

Revision ID: a4b5c6d7e8f9
Revises: f3a4b5c6d7e8
Create Date: 2026-06-08
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a4b5c6d7e8f9"
down_revision: Union[str, Sequence[str], None] = "f3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSONB = postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    op.create_table(
        "semantic_model_fields",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("semantic_model_id", sa.String(length=64), nullable=False),
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
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["semantic_model_id"], ["semantic_models.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "semantic_model_id", "dataset_id", "name", name="uq_semantic_model_fields_model_dataset_name"
        ),
    )
    op.create_index(
        "ix_semantic_model_fields_semantic_model_id", "semantic_model_fields", ["semantic_model_id"]
    )
    op.create_index("ix_semantic_model_fields_dataset_id", "semantic_model_fields", ["dataset_id"])

    op.create_table(
        "dataset_columns",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=False),
        sa.Column("column_name", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=512), nullable=True),
        sa.Column("created_by_name", sa.String(length=256), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dataset_id", "column_name", name="uq_dataset_columns_dataset_column"),
    )
    op.create_index("ix_dataset_columns_dataset_id", "dataset_columns", ["dataset_id"])

    # Fan each dataset field out to every model that covers its dataset.
    op.execute(
        """
        INSERT INTO semantic_model_fields (
          id, semantic_model_id, dataset_id, name, column_name, expression,
          datatype, dimension, ai_context, ordinal, created_by, created_by_name,
          created_at, updated_at
        )
        SELECT
          md5(random()::text || clock_timestamp()::text || f.id),
          smd.semantic_model_id, f.dataset_id, f.name, f.column_name, f.expression,
          f.datatype, f.dimension, f.ai_context, f.ordinal, f.created_by, f.created_by_name,
          now(), now()
        FROM dataset_fields f
        JOIN semantic_model_datasets smd ON smd.dataset_id = f.dataset_id
        """
    )

    op.drop_index("ix_dataset_fields_dataset_id", table_name="dataset_fields")
    op.drop_table("dataset_fields")

    op.drop_index("ix_saved_queries_semantic_model_id", table_name="saved_queries")
    op.drop_index("ix_saved_queries_base_dataset_id", table_name="saved_queries")
    op.drop_table("saved_queries")


def downgrade() -> None:
    raise NotImplementedError("Irreversible: dataset_fields / saved_queries were split and dropped.")
