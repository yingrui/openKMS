"""Add datasets.unique_keys and datasets.ai_context (Ossie semantic fields).

Revision ID: f8e7d6c5b4a3
Revises: d0e1f2a3b4c5
Create Date: 2026-06-08

`unique_keys` drives relationship targets (1:1) and semantics; `ai_context`
carries agent grounding (instructions / synonyms / examples).
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f8e7d6c5b4a3"
down_revision: Union[str, Sequence[str], None] = "d0e1f2a3b4c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSONB = postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    op.add_column(
        "datasets",
        sa.Column(
            "unique_keys",
            _JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column("datasets", sa.Column("ai_context", _JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("datasets", "ai_context")
    op.drop_column("datasets", "unique_keys")
