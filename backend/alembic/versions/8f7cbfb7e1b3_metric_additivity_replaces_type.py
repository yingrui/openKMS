"""metric additivity replaces type

Revision ID: 8f7cbfb7e1b3
Revises: e1a2b3c4d5f6
Create Date: 2026-11-14 23:49:04.192496

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8f7cbfb7e1b3'
down_revision: Union[str, Sequence[str], None] = 'e1a2b3c4d5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """`type` carried no behaviour — it was exported and never read. `additivity` does.

    A ratio or a conversion was the only case where the old label said something a consumer must
    obey (never sum it), so those two map to `non_additive`; everything else can be added up.
    """
    op.add_column(
        "metric_definitions",
        sa.Column("additivity", sa.String(length=32), nullable=False, server_default="additive"),
    )
    op.execute(
        "UPDATE metric_definitions SET additivity = 'non_additive' "
        "WHERE type IN ('ratio', 'conversion')"
    )
    op.drop_column("metric_definitions", "type")


def downgrade() -> None:
    op.add_column(
        "metric_definitions",
        sa.Column("type", sa.String(length=32), nullable=False, server_default="simple"),
    )
    op.execute(
        "UPDATE metric_definitions SET type = CASE additivity "
        "WHEN 'non_additive' THEN 'ratio' ELSE 'simple' END"
    )
    op.drop_column("metric_definitions", "additivity")
