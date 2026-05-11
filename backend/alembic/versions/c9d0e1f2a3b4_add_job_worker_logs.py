"""add job_worker_logs for worker subprocess output

Revision ID: c9d0e1f2a3b4
Revises: b0af327086c6
Create Date: 2026-05-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, None] = "b0af327086c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "job_worker_logs",
        sa.Column("procrastinate_job_id", sa.BigInteger(), nullable=False),
        sa.Column("log_text", sa.Text(), nullable=False),
        sa.Column("truncated", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("char_limit_applied", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("procrastinate_job_id", name="job_worker_logs_pkey"),
    )


def downgrade() -> None:
    op.drop_table("job_worker_logs")
