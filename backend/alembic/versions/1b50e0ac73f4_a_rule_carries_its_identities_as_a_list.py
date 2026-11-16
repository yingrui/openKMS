"""a rule carries its identities as a list

Revision ID: 1b50e0ac73f4
Revises: bc4c2f905064
Create Date: 2026-11-16 17:02:49.433462

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '1b50e0ac73f4'
down_revision: Union[str, Sequence[str], None] = 'bc4c2f905064'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """`relation` → `identities`: one rule may assert several equalities at once.

    A snapshot's four numbers (amount, line count, over-max, below-min) belong to one check of one subject:
    as four rules they drift apart (four severities, four suggestions, four alerts for one incident), and
    each needs its own run. As a list they are judged together, per scope, and the evidence names the
    identity that failed.
    """
    op.add_column(
        "metric_rules",
        sa.Column("identities", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.execute(
        "UPDATE metric_rules SET identities = jsonb_build_array(relation) WHERE relation IS NOT NULL"
    )
    op.drop_column("metric_rules", "relation")


def downgrade() -> None:
    op.add_column(
        "metric_rules",
        sa.Column("relation", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.execute("UPDATE metric_rules SET relation = identities -> 0 WHERE identities IS NOT NULL")
    op.execute("DELETE FROM metric_rules WHERE identities IS NOT NULL AND jsonb_array_length(identities) > 1")
    op.drop_column("metric_rules", "identities")
