"""Rename job_worker_logs → job_run_worker_logs; procrastinate_job_id → job_run_id.

Revision ID: s8t9u0v1w2x3
Revises: r7s8t9u0v1w2
"""

from __future__ import annotations

from alembic import op

revision = "s8t9u0v1w2x3"
down_revision = "r7s8t9u0v1w2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.rename_table("job_worker_logs", "job_run_worker_logs")
    op.alter_column(
        "job_run_worker_logs",
        "procrastinate_job_id",
        new_column_name="job_run_id",
    )
    op.execute(
        "ALTER TABLE job_run_worker_logs "
        "RENAME CONSTRAINT job_worker_logs_pkey TO job_run_worker_logs_pkey"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE job_run_worker_logs "
        "RENAME CONSTRAINT job_run_worker_logs_pkey TO job_worker_logs_pkey"
    )
    op.alter_column(
        "job_run_worker_logs",
        "job_run_id",
        new_column_name="procrastinate_job_id",
    )
    op.rename_table("job_run_worker_logs", "job_worker_logs")
