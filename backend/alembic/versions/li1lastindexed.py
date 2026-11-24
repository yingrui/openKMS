"""object_types: last_indexed_at

Revision ID: li1lastindexed
Revises: ex1explorations
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "li1lastindexed"
down_revision = "ex1explorations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "object_types",
        sa.Column("last_indexed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("object_types", "last_indexed_at")
