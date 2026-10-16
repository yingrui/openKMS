"""Drop explorer dashboard runs (the run history was removed).

Revision ID: a1b2c3d4e5f9
Revises: 90cf4bba2f75
Create Date: 2026-10-16

The history answered two questions — "when did this last actually work" and "has it been failing
since" — that did not justify a table, an endpoint, a panel and a skill command. A tile's `as of`
already covers freshness, and if the failure pattern ever matters again the cheap answer is two fields
on the report itself (`last_success_at`, `consecutive_failures`), not a log.

Applied migrations are history, so the table is dropped here rather than by rewriting
`90cf4bba2f75`. Hand-written: `--autogenerate` on this database also proposes dropping the LangGraph
`checkpoint*` tables, several indexes and NOT NULL changes (the metadata has drifted), which is not
this change's business.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f9"
down_revision: Union[str, Sequence[str], None] = "90cf4bba2f75"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index(op.f("ix_explorer_dashboard_runs_ran_at"), table_name="explorer_dashboard_runs")
    op.drop_index(
        op.f("ix_explorer_dashboard_runs_dashboard_id"), table_name="explorer_dashboard_runs"
    )
    op.drop_table("explorer_dashboard_runs")


def downgrade() -> None:
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
