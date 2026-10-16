"""Rename report charts to blocks and add the report's source.

Revision ID: e7a1c2b3d4e5
Revises: d4c3b2a1f0e9
Create Date: 2026-02-14
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e7a1c2b3d4e5"
down_revision: Union[str, Sequence[str], None] = "d4c3b2a1f0e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # A rename, not a drop: an existing report's stored rows are still its last result.
    op.alter_column("explorer_reports", "charts", new_column_name="blocks")
    op.add_column(
        "explorer_reports",
        sa.Column("source_kind", sa.String(length=16), nullable=False, server_default="dataset"),
    )
    op.add_column(
        "explorer_reports",
        sa.Column("semantic_model_id", sa.String(length=64), nullable=True),
    )
    op.create_foreign_key(
        "fk_explorer_reports_semantic_model_id",
        "explorer_reports",
        "semantic_models",
        ["semantic_model_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_explorer_reports_semantic_model_id", "explorer_reports", ["semantic_model_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_explorer_reports_semantic_model_id", table_name="explorer_reports")
    op.drop_constraint(
        "fk_explorer_reports_semantic_model_id", "explorer_reports", type_="foreignkey"
    )
    op.drop_column("explorer_reports", "semantic_model_id")
    op.drop_column("explorer_reports", "source_kind")
    op.alter_column("explorer_reports", "blocks", new_column_name="charts")
