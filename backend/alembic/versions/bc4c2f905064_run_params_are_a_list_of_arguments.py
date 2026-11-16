"""run params are a list of arguments

Revision ID: bc4c2f905064
Revises: 8e98d384039b
Create Date: 2026-11-16 12:13:42.242665

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bc4c2f905064'
down_revision: Union[str, Sequence[str], None] = '8e98d384039b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """`{period: {...}}` → `{arguments: [{key: "period", kind: "period", binding: {...}}]}`.

    A period was the only argument the shape could hold. It is now one of three kinds (`period`, `filter`,
    `key`), stored as a list — so a rule can take a channel slice or a narrowed scope set without being
    cloned, and the next kind is an entry rather than a schema change.
    """
    op.execute(
        """
        UPDATE metric_rules
        SET run_params = jsonb_build_object(
            'arguments',
            jsonb_build_array(
                jsonb_build_object(
                    'key', 'period',
                    'kind', 'period',
                    'binding', run_params -> 'period'
                )
            )
        )
        WHERE run_params ? 'period'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE metric_rules
        SET run_params = jsonb_build_object('period', run_params #> '{arguments,0,binding}')
        WHERE jsonb_array_length(run_params -> 'arguments') = 1
          AND run_params #> '{arguments,0,kind}' = '"period"'
        """
    )
