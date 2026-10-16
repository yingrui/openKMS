"""Add explorer dashboard runs (a dashboard's run history).

Revision ID: 90cf4bba2f75
Revises: d1c2b3a4e5f6
Create Date: 2026-10-16

A report already keeps its own last result; this keeps the **document's** history — when it was last
refreshed, how long that took, and how many of its reports failed — which nothing could answer.

Written by hand on purpose. `alembic revision --autogenerate` produced this table *plus* a pile of
unrelated operations (dropping the LangGraph `checkpoint*` tables, several indexes, and NOT NULL
changes on `access_groups` / `media_assets`): the metadata and this database have drifted, and
autogenerate proposes to reconcile that by deleting things. Reviewing the generated file is not a
formality.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "90cf4bba2f75"
down_revision: Union[str, Sequence[str], None] = "d1c2b3a4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "explorer_dashboard_runs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("dashboard_id", sa.String(length=64), nullable=False),
        sa.Column(
            "ran_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("reports", sa.Integer(), nullable=False),
        sa.Column("failed", sa.Integer(), nullable=False),
        sa.Column("ran_by_name", sa.String(length=256), nullable=True),
        sa.ForeignKeyConstraint(["dashboard_id"], ["explorer_dashboards.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_explorer_dashboard_runs_dashboard_id"),
        "explorer_dashboard_runs",
        ["dashboard_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_explorer_dashboard_runs_ran_at"), "explorer_dashboard_runs", ["ran_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_explorer_dashboard_runs_ran_at"), table_name="explorer_dashboard_runs")
    op.drop_index(
        op.f("ix_explorer_dashboard_runs_dashboard_id"), table_name="explorer_dashboard_runs"
    )
    op.drop_table("explorer_dashboard_runs")
