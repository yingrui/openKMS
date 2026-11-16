"""rule run params

Revision ID: 8e98d384039b
Revises: 79a0d6c56424
Create Date: 2026-11-16 11:53:45.834871

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '8e98d384039b'
down_revision: Union[str, Sequence[str], None] = '79a0d6c56424'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """How a check uses the period is the check's decision, not a fact inherited from the metric.

    `{period: {source: inherit|field|none, field?, offset}}` — inherit each operand's own time dimension,
    filter all operands on one named dimension, or use the period as a label only; `offset` shifts the run to
    an earlier period (previous week/month/quarter/year). The period *value* stays a run argument.
    """
    op.add_column(
        "metric_rules",
        sa.Column("run_params", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("metric_rules", "run_params")
