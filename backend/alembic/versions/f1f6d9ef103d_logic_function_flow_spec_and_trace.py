"""logic functions: version flow_spec and execution trace

A Logic function's body is a flow (nodes of prompt + ontology tools), not Python source, so the version carries
`flow_spec` next to `source_code`. Running one produces a per-node record — prompt as sent, tokens, duration — which
lives on the execution row so the editor can show it next to the output.

Both columns are nullable: code functions never use either, and existing rows are unaffected.

Revision ID: f1f6d9ef103d
Revises: li1lastindexed
Create Date: 2026-11-23 15:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "f1f6d9ef103d"
down_revision: Union[str, Sequence[str], None] = "li1lastindexed"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ontology_function_versions",
        sa.Column("flow_spec", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "ontology_function_executions",
        sa.Column("trace", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ontology_function_executions", "trace")
    op.drop_column("ontology_function_versions", "flow_spec")
