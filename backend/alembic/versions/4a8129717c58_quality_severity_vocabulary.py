"""quality severity vocabulary

Revision ID: 4a8129717c58
Revises: 8b9c0d1e2f3a
Create Date: 2026-11-09 11:52:09.351661

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4a8129717c58'
down_revision: Union[str, Sequence[str], None] = '8b9c0d1e2f3a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


PRIORITY = ("P0", "P1", "P2")


def upgrade() -> None:
    """Give severity a vocabulary, and read the one old value as the middle of it."""
    # `warning` was the only value ever written (the column's default). P1 is the same intent, named.
    op.execute("UPDATE quality_rules SET severity = 'P1' WHERE severity NOT IN ('P0', 'P1', 'P2')")
    op.alter_column(
        "quality_rules",
        "severity",
        existing_type=sa.String(16),
        type_=sa.String(8),
        existing_nullable=False,
        existing_server_default="warning",
        server_default="P1",
    )
    # The vocabulary is enforced where nothing can bypass it: a typo becomes a failed write, not a rule
    # that silently sorts into a bucket nobody checks.
    op.create_check_constraint(
        "ck_quality_rules_severity", "quality_rules", "severity IN ('P0', 'P1', 'P2')"
    )


def downgrade() -> None:
    """Back to one unlabelled value."""
    op.drop_constraint("ck_quality_rules_severity", "quality_rules", type_="check")
    op.execute("UPDATE quality_rules SET severity = 'warning'")
    op.alter_column(
        "quality_rules",
        "severity",
        existing_type=sa.String(8),
        type_=sa.String(16),
        existing_nullable=False,
        existing_server_default="P1",
        server_default="warning",
    )


def downgrade() -> None:
    """Downgrade schema."""
    pass
