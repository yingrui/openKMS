"""Normalize any remaining map-form expressions to the Ossie list form.

`{"dialects": {"ANSI_SQL": "…"}}` -> `{"dialects": [{"dialect": "ANSI_SQL", "expression": "…"}]}`
(idempotent; catches rows written with the earlier shape).

Revision ID: f0a1b2c3d4e5
Revises: d2e3f4a5b6c9
Create Date: 2026-06-08
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "f0a1b2c3d4e5"
down_revision: Union[str, Sequence[str], None] = "d2e3f4a5b6c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES = ("metric_definitions", "semantic_model_fields")


def upgrade() -> None:
    for table in _TABLES:
        op.execute(
            f"""
            UPDATE {table}
            SET expression = jsonb_build_object(
              'dialects',
              (SELECT jsonb_agg(jsonb_build_object('dialect', e.key, 'expression', e.value) ORDER BY e.key)
               FROM jsonb_each_text(expression -> 'dialects') AS e)
            )
            WHERE expression IS NOT NULL
              AND jsonb_typeof(expression -> 'dialects') = 'object'
            """
        )


def downgrade() -> None:
    pass
