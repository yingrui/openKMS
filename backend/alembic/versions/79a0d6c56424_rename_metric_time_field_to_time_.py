"""rename metric time field to time dimension

Revision ID: 79a0d6c56424
Revises: 947c45ee1b33
Create Date: 2026-11-16 01:03:28.228363

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '79a0d6c56424'
down_revision: Union[str, Sequence[str], None] = '947c45ee1b33'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Say "time dimension", the word the spec uses: a field whose `dimension.is_time` resolves true.

    Grain is a consumption-time choice in Ossie; a metric has no period at all. What a rule's period filters
    on is a *field*, so the column is named for that and validated as a time dimension when it is set.
    """
    op.alter_column("metric_definitions", "time_field", new_column_name="time_dimension")


def downgrade() -> None:
    op.alter_column("metric_definitions", "time_dimension", new_column_name="time_field")
