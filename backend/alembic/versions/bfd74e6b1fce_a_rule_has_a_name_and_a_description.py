"""a rule has a name and a description

Revision ID: bfd74e6b1fce
Revises: 6bd196880493
Create Date: 2026-11-16 20:41:19.428020

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bfd74e6b1fce'
down_revision: Union[str, Sequence[str], None] = '6bd196880493'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """A rule's name is a label; what it checks is a sentence. One string was doing both.

    A name long enough to explain the check does not fit a rail, a table cell or a breadcrumb, so the two
    are separate: `name` is the short label, `description` says what holds and why.
    """
    op.add_column(
        "metric_rules", sa.Column("description", sa.Text(), nullable=False, server_default="")
    )
    op.alter_column("metric_rules", "description", server_default=None)


def downgrade() -> None:
    op.drop_column("metric_rules", "description")
