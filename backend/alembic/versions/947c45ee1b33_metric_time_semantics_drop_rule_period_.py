"""metric time semantics, drop rule period field

Revision ID: 947c45ee1b33
Revises: 0c082f0aba6e
Create Date: 2026-11-16 00:46:01.944913

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '947c45ee1b33'
down_revision: Union[str, Sequence[str], None] = '0c082f0aba6e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Time semantics belong to the metric (how its data relates to time), not to each rule.

    `period` — a column carries the period, so a run filters on it;
    `snapshot` — only the current value can be computed, so a past-period run is refused;
    `none` — no time concept; a run's period is a label.

    The rule-level `period_field` from the previous revision is dropped: it was per check, while the fact is
    per data. An operand may still override the column (`{metric: …, period_field: …}`).
    """
    op.add_column(
        "metric_definitions",
        sa.Column("time_mode", sa.String(length=16), nullable=False, server_default="none"),
    )
    op.add_column(
        "metric_definitions",
        sa.Column("time_field", sa.String(length=128), nullable=True),
    )
    op.drop_column("metric_rules", "period_field")


def downgrade() -> None:
    op.add_column("metric_rules", sa.Column("period_field", sa.String(length=128), nullable=True))
    op.drop_column("metric_definitions", "time_field")
    op.drop_column("metric_definitions", "time_mode")
