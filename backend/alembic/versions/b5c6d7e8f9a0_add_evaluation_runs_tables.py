"""add evaluation_runs and evaluation_run_items

Revision ID: b5c6d7e8f9a0
Revises: z4a5b6c7d8e9
Create Date: 2026-03-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "b5c6d7e8f9a0"
down_revision: Union[str, None] = "z4a5b6c7d8e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names_on_table(bind, table_name: str) -> set[str]:
    insp = sa.inspect(bind)
    if not insp.has_table(table_name):
        return set()
    return {ix["name"] for ix in insp.get_indexes(table_name)}


def _create_index_if_missing(bind, name: str, table: str, columns: list[str]) -> None:
    if name in _index_names_on_table(bind, table):
        return
    op.create_index(name, table, columns)


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if not insp.has_table("evaluation_runs"):
        op.create_table(
            "evaluation_runs",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column(
                "evaluation_dataset_id",
                sa.String(64),
                sa.ForeignKey("evaluation_datasets.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("knowledge_base_id", sa.String(64), nullable=False),
            sa.Column("evaluation_type", sa.String(64), nullable=False),
            sa.Column("status", sa.String(32), nullable=False, server_default="completed"),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("item_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("pass_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("avg_score", sa.Float(), nullable=True),
            sa.Column("config_snapshot", JSONB(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        )

    insp = sa.inspect(bind)
    if not insp.has_table("evaluation_run_items"):
        op.create_table(
            "evaluation_run_items",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column(
                "evaluation_run_id",
                sa.String(64),
                sa.ForeignKey("evaluation_runs.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "evaluation_dataset_item_id",
                sa.String(64),
                sa.ForeignKey("evaluation_dataset_items.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("passed", sa.Boolean(), nullable=False),
            sa.Column("score", sa.Float(), nullable=False),
            sa.Column("reasoning", sa.Text(), nullable=False),
            sa.Column("detail", JSONB(), nullable=True),
        )

    # Re-inspect after possible creates (connection may cache; index creation needs current state)
    bind = op.get_bind()
    _create_index_if_missing(
        bind, "ix_evaluation_runs_evaluation_dataset_id", "evaluation_runs", ["evaluation_dataset_id"]
    )
    _create_index_if_missing(bind, "ix_evaluation_runs_knowledge_base_id", "evaluation_runs", ["knowledge_base_id"])
    _create_index_if_missing(
        bind,
        "ix_evaluation_runs_dataset_created",
        "evaluation_runs",
        ["evaluation_dataset_id", "created_at"],
    )
    _create_index_if_missing(
        bind,
        "ix_evaluation_run_items_evaluation_run_id",
        "evaluation_run_items",
        ["evaluation_run_id"],
    )
    _create_index_if_missing(
        bind,
        "ix_evaluation_run_items_dataset_item_id",
        "evaluation_run_items",
        ["evaluation_dataset_item_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_evaluation_run_items_dataset_item_id", table_name="evaluation_run_items")
    op.drop_index("ix_evaluation_run_items_evaluation_run_id", table_name="evaluation_run_items")
    op.drop_table("evaluation_run_items")
    op.drop_index("ix_evaluation_runs_dataset_created", table_name="evaluation_runs")
    op.drop_index("ix_evaluation_runs_knowledge_base_id", table_name="evaluation_runs")
    op.drop_index("ix_evaluation_runs_evaluation_dataset_id", table_name="evaluation_runs")
    op.drop_table("evaluation_runs")
