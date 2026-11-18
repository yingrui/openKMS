"""dataset columns: time_format

Revision ID: dc1timeformat
Revises: jo1fromunique
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "dc1timeformat"
down_revision = "jo1fromunique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("dataset_columns", sa.Column("time_format", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("dataset_columns", "time_format")
