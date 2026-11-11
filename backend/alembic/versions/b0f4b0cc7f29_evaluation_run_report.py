"""evaluation run report: what a run says about the agent, not about one item

Revision ID: b0f4b0cc7f29
Revises: 0101ee4e1edd
Create Date: 2026-11-11 21:52:59.069645

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b0f4b0cc7f29'
down_revision: Union[str, Sequence[str], None] = '0101ee4e1edd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('evaluation_runs', sa.Column('report', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('evaluation_runs', 'report')
