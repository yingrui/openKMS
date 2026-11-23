"""drop chamber_apps.status

Chamber has one state — registered — since publishing was removed (`08327ca4c4fe`). That migration kept the column
because dropping it was a second, unrelated operation; this is that operation. Nothing reads the value: the API
stopped exposing a `?status=` filter here too, and the gallery never branched on it.

Rows carrying `draft`/`published` from before need no mapping: the column is going away, not being reinterpreted.

Revision ID: 8b7aeb068564
Revises: 5ea40717a131
Create Date: 2026-11-23 12:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "8b7aeb068564"
down_revision: Union[str, Sequence[str], None] = "5ea40717a131"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("chamber_apps", "status")


def downgrade() -> None:
    op.add_column(
        "chamber_apps",
        sa.Column("status", sa.String(length=32), nullable=False, server_default="registered"),
    )
