"""rule period field

Revision ID: 0c082f0aba6e
Revises: 15a0bd69314e
Create Date: 2026-11-16 00:33:03.813026

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0c082f0aba6e'
down_revision: Union[str, Sequence[str], None] = '15a0bd69314e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """A rule may name the column a run's period filters on.

    Without it the period is only a label: the alert is filed under "2026-W46" while the numbers were
    computed over everything. The column is optional because some subjects have no time column at all — in
    that case the UI says the period identifies the run rather than scoping it.
    """
    op.add_column(
        "metric_rules",
        sa.Column("period_field", sa.String(length=128), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("metric_rules", "period_field")
