"""Re-model dataset_joins as Ossie relationships (FK: from many -> to one).

Revision ID: d0e1f2a3b4c5
Revises: b4c5d6e7f8a9
Create Date: 2026-06-08

Renames source/target -> from/to, splits `join_columns` into order-aligned
`from_columns`/`to_columns`, drops `cardinality`, adds `join_type` + `ai_context`.
Existing rows migrate in place (source -> from/many, target -> to/one).
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d0e1f2a3b4c5"
down_revision: Union[str, Sequence[str], None] = "b4c5d6e7f8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSONB = postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    op.add_column("dataset_joins", sa.Column("from_dataset_id", sa.String(length=64), nullable=True))
    op.add_column("dataset_joins", sa.Column("to_dataset_id", sa.String(length=64), nullable=True))
    op.add_column("dataset_joins", sa.Column("from_columns", _JSONB, nullable=True))
    op.add_column("dataset_joins", sa.Column("to_columns", _JSONB, nullable=True))
    op.add_column(
        "dataset_joins",
        sa.Column("join_type", sa.String(length=8), nullable=False, server_default="left"),
    )
    op.add_column("dataset_joins", sa.Column("ai_context", _JSONB, nullable=True))

    op.execute(
        """
        UPDATE dataset_joins SET
          from_dataset_id = source_dataset_id,
          to_dataset_id = target_dataset_id,
          from_columns = COALESCE(
            (SELECT jsonb_agg(e ->> 'source') FROM jsonb_array_elements(join_columns) e),
            '[]'::jsonb
          ),
          to_columns = COALESCE(
            (SELECT jsonb_agg(e ->> 'target') FROM jsonb_array_elements(join_columns) e),
            '[]'::jsonb
          )
        """
    )

    op.alter_column("dataset_joins", "from_dataset_id", nullable=False)
    op.alter_column("dataset_joins", "to_dataset_id", nullable=False)
    op.alter_column("dataset_joins", "from_columns", nullable=False)
    op.alter_column("dataset_joins", "to_columns", nullable=False)

    op.drop_constraint("dataset_joins_source_dataset_id_fkey", "dataset_joins", type_="foreignkey")
    op.drop_constraint("dataset_joins_target_dataset_id_fkey", "dataset_joins", type_="foreignkey")
    op.create_foreign_key(
        "dataset_joins_from_dataset_id_fkey",
        "dataset_joins",
        "datasets",
        ["from_dataset_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "dataset_joins_to_dataset_id_fkey",
        "dataset_joins",
        "datasets",
        ["to_dataset_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_index("ix_dataset_joins_source_dataset_id", table_name="dataset_joins")
    op.drop_index("ix_dataset_joins_target_dataset_id", table_name="dataset_joins")
    op.create_index("ix_dataset_joins_from_dataset_id", "dataset_joins", ["from_dataset_id"])
    op.create_index("ix_dataset_joins_to_dataset_id", "dataset_joins", ["to_dataset_id"])

    op.drop_constraint("ck_dataset_joins_distinct_datasets", "dataset_joins", type_="check")
    op.create_check_constraint(
        "ck_dataset_joins_distinct_datasets", "dataset_joins", "from_dataset_id <> to_dataset_id"
    )

    op.drop_column("dataset_joins", "source_dataset_id")
    op.drop_column("dataset_joins", "target_dataset_id")
    op.drop_column("dataset_joins", "cardinality")
    op.drop_column("dataset_joins", "join_columns")


def downgrade() -> None:
    op.add_column("dataset_joins", sa.Column("source_dataset_id", sa.String(length=64), nullable=True))
    op.add_column("dataset_joins", sa.Column("target_dataset_id", sa.String(length=64), nullable=True))
    op.add_column("dataset_joins", sa.Column("cardinality", sa.String(length=16), nullable=False, server_default="one-to-many"))
    op.add_column("dataset_joins", sa.Column("join_columns", _JSONB, nullable=True))
    op.execute(
        """
        UPDATE dataset_joins SET
          source_dataset_id = from_dataset_id,
          target_dataset_id = to_dataset_id,
          join_columns = COALESCE(
            (SELECT jsonb_agg(jsonb_build_object('source', f, 'target', t))
             FROM jsonb_array_elements_text(from_columns) WITH ORDINALITY AS s(f, i)
             JOIN jsonb_array_elements_text(to_columns) WITH ORDINALITY AS d(t, j) ON s.i = d.j),
            '[]'::jsonb
          )
        """
    )
    op.alter_column("dataset_joins", "source_dataset_id", nullable=False)
    op.alter_column("dataset_joins", "target_dataset_id", nullable=False)
    op.alter_column("dataset_joins", "join_columns", nullable=False)
    op.drop_column("dataset_joins", "from_dataset_id")
    op.drop_column("dataset_joins", "to_dataset_id")
    op.drop_column("dataset_joins", "from_columns")
    op.drop_column("dataset_joins", "to_columns")
    op.drop_column("dataset_joins", "join_type")
    op.drop_column("dataset_joins", "ai_context")

    op.create_foreign_key(
        "dataset_joins_source_dataset_id_fkey",
        "dataset_joins",
        "datasets",
        ["source_dataset_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "dataset_joins_target_dataset_id_fkey",
        "dataset_joins",
        "datasets",
        ["target_dataset_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_dataset_joins_source_dataset_id", "dataset_joins", ["source_dataset_id"])
    op.create_index("ix_dataset_joins_target_dataset_id", "dataset_joins", ["target_dataset_id"])
    op.create_check_constraint(
        "ck_dataset_joins_distinct_datasets", "dataset_joins", "source_dataset_id <> target_dataset_id"
    )
