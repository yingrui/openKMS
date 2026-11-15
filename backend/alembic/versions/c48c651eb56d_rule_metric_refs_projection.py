"""rule metric refs projection

Revision ID: c48c651eb56d
Revises: 8f7cbfb7e1b3
Create Date: 2026-11-15 21:12:32.773044

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c48c651eb56d'
down_revision: Union[str, Sequence[str], None] = '8f7cbfb7e1b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """A rule's metric references become a queryable fact (see `services/ontology/rules/refs.py`).

    Derived from the rule JSONB on every write; the backfill runs at startup for rules that predate this
    table, so the migration itself only creates the shape.
    """
    op.create_table(
        "rule_metric_refs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("rule_id", sa.String(length=64), nullable=False),
        sa.Column("metric_id", sa.String(length=64), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.ForeignKeyConstraint(["metric_id"], ["metric_definitions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_rule_metric_refs_rule_id", "rule_metric_refs", ["rule_id"])
    op.create_index("ix_rule_metric_refs_metric", "rule_metric_refs", ["metric_id"])


def downgrade() -> None:
    op.drop_index("ix_rule_metric_refs_metric", table_name="rule_metric_refs")
    op.drop_index("ix_rule_metric_refs_rule_id", table_name="rule_metric_refs")
    op.drop_table("rule_metric_refs")
