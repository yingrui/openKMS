"""Field dimensions/entities: `dimension.is_time` -> Ossie `dimension.type`.

Add `description` + `entity` to `semantic_model_fields`, and migrate the old
`{"is_time": bool}` role to Ossie's `{"type": "time"|"categorical", …}`.

Revision ID: f9a0b1c2d3e4
Revises: e8f9a0b1c2d3
Create Date: 2026-06-08
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f9a0b1c2d3e4"
down_revision: Union[str, Sequence[str], None] = "e8f9a0b1c2d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSONB = postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    op.add_column("semantic_model_fields", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("semantic_model_fields", sa.Column("entity", _JSONB, nullable=True))
    op.execute(
        """
        UPDATE semantic_model_fields SET dimension = CASE
          WHEN dimension ->> 'is_time' = 'true' THEN '{"type": "time"}'::jsonb
          ELSE NULL
        END
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE semantic_model_fields SET dimension = CASE
          WHEN dimension ->> 'type' = 'time' THEN '{"is_time": true}'::jsonb
          ELSE NULL
        END
        """
    )
    op.drop_column("semantic_model_fields", "entity")
    op.drop_column("semantic_model_fields", "description")
