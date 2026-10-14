"""Conform field dimension to the Ossie core spec.

The core spec's `Dimension` is **only** `{is_time: boolean}`. Convert
`{"type": "time"}` -> `{"is_time": true}` (other roles are not a core concept ->
null) and drop `entity` (not in the core spec).

Revision ID: d2e3f4a5b6c9
Revises: b0c1d2e3f4a6
Create Date: 2026-06-08
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "d2e3f4a5b6c9"
down_revision: Union[str, Sequence[str], None] = "b0c1d2e3f4a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE semantic_model_fields SET dimension = CASE
          WHEN dimension ->> 'type' = 'time' THEN '{"is_time": true}'::jsonb
          ELSE NULL
        END
        """
    )
    op.drop_column("semantic_model_fields", "entity")


def downgrade() -> None:
    import sqlalchemy as sa
    from sqlalchemy.dialects import postgresql

    op.add_column(
        "semantic_model_fields",
        sa.Column(
            "entity", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
    )
    op.execute(
        """
        UPDATE semantic_model_fields SET dimension = CASE
          WHEN dimension ->> 'is_time' = 'true' THEN '{"type": "time"}'::jsonb
          ELSE NULL
        END
        """
    )
