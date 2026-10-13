"""Relationship join optionality: join_type (left/inner/right/full) -> required (bool).

A relationship is a Dataset↔Dataset FK edge. It carries only edge facts: FK
direction (from/to), column mapping, and whether a match is **required**
(true → INNER JOIN) or optional (false → LEFT JOIN, the default). `right`/`full`
are dropped — `right` ≡ a swapped `left`, and the query anchor fixes the join
side, so an edge-level `right` was a footgun.

Revision ID: d1e2f3a4b5c7
Revises: f8a9b0c1d2e3
Create Date: 2026-06-08
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d1e2f3a4b5c7"
down_revision: Union[str, Sequence[str], None] = "f8a9b0c1d2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "dataset_joins",
        sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # inner → required; left/right/full → optional (left).
    op.execute("UPDATE dataset_joins SET required = (join_type = 'inner')")
    op.drop_column("dataset_joins", "join_type")


def downgrade() -> None:
    op.add_column(
        "dataset_joins",
        sa.Column("join_type", sa.String(length=8), nullable=False, server_default="left"),
    )
    op.execute("UPDATE dataset_joins SET join_type = CASE WHEN required THEN 'inner' ELSE 'left' END")
    op.drop_column("dataset_joins", "required")
