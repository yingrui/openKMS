"""Re-model metric_definitions as model-level Ossie metrics + add metric_runs audit.

Revision ID: a3b4c5d6e7f9
Revises: a6b7c8d9e0f1
Create Date: 2026-06-08

- rename `dataset_id` -> `base_dataset_id` (the metric's anchor dataset)
- add `type`, `expression`, `datatype`, `ai_context`
- drop `aggregation`, `column_name`, `dimensions` (dimensions move to queries)
- backfill `expression.dialects.ANSI_SQL` from the old aggregation/column so
  existing metrics keep working
- create `metric_runs` (execution audit)
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a3b4c5d6e7f9"
down_revision: Union[str, Sequence[str], None] = "a6b7c8d9e0f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSONB = postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    op.alter_column(
        "metric_definitions", "dataset_id", new_column_name="base_dataset_id", existing_type=sa.String(length=64)
    )
    op.drop_constraint(
        "metric_definitions_dataset_id_fkey", "metric_definitions", type_="foreignkey"
    )
    op.create_foreign_key(
        "metric_definitions_base_dataset_id_fkey",
        "metric_definitions",
        "datasets",
        ["base_dataset_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_index("ix_metric_definitions_dataset_id", table_name="metric_definitions")
    op.create_index(
        "ix_metric_definitions_base_dataset_id", "metric_definitions", ["base_dataset_id"]
    )

    op.add_column(
        "metric_definitions",
        sa.Column("type", sa.String(length=32), nullable=False, server_default="simple"),
    )
    op.add_column("metric_definitions", sa.Column("expression", _JSONB, nullable=True))
    op.add_column("metric_definitions", sa.Column("datatype", sa.String(length=32), nullable=True))
    op.add_column("metric_definitions", sa.Column("ai_context", _JSONB, nullable=True))

    op.execute(
        """
        UPDATE metric_definitions SET expression = jsonb_build_object(
          'dialects', jsonb_build_object('ANSI_SQL',
            CASE
              WHEN aggregation = 'count' AND (column_name IS NULL OR column_name = '') THEN 'COUNT(*)'
              WHEN aggregation = 'count' THEN 'COUNT("' || column_name || '")'
              ELSE upper(aggregation) || '("' || column_name || '")'
            END
          )
        )
        """
    )

    op.drop_column("metric_definitions", "aggregation")
    op.drop_column("metric_definitions", "column_name")
    op.drop_column("metric_definitions", "dimensions")

    op.create_table(
        "metric_runs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("metric_id", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("duration_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("ran_by", sa.String(length=512), nullable=True),
        sa.Column("ran_by_name", sa.String(length=256), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["metric_id"], ["metric_definitions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_metric_runs_metric_id", "metric_runs", ["metric_id"])


def downgrade() -> None:
    op.drop_index("ix_metric_runs_metric_id", table_name="metric_runs")
    op.drop_table("metric_runs")

    op.add_column(
        "metric_definitions",
        sa.Column("aggregation", sa.String(length=16), nullable=False, server_default="count"),
    )
    op.add_column("metric_definitions", sa.Column("column_name", sa.String(length=256), nullable=True))
    op.add_column("metric_definitions", sa.Column("dimensions", _JSONB, nullable=True))
    op.drop_column("metric_definitions", "type")
    op.drop_column("metric_definitions", "expression")
    op.drop_column("metric_definitions", "datatype")
    op.drop_column("metric_definitions", "ai_context")

    op.drop_constraint(
        "metric_definitions_base_dataset_id_fkey", "metric_definitions", type_="foreignkey"
    )
    op.create_foreign_key(
        "metric_definitions_dataset_id_fkey",
        "metric_definitions",
        "datasets",
        ["base_dataset_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_index("ix_metric_definitions_base_dataset_id", table_name="metric_definitions")
    op.create_index("ix_metric_definitions_dataset_id", "metric_definitions", ["base_dataset_id"])
    op.alter_column(
        "metric_definitions", "base_dataset_id", new_column_name="dataset_id", existing_type=sa.String(length=64)
    )
