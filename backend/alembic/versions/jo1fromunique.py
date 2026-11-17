"""relationships: a one-to-one flag

Revision ID: jo1fromunique
Revises: bfd74e6b1fce
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "jo1fromunique"
down_revision = "bfd74e6b1fce"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "dataset_joins",
        sa.Column("from_unique", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("dataset_joins", "from_unique")
