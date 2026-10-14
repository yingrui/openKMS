"""Ossie expression dialects: map -> list.

`{"dialects": {"ANSI_SQL": "…"}}` -> `{"dialects": [{"dialect": "ANSI_SQL", "expression": "…"}]}`.

Revision ID: e8f9a0b1c2d3
Revises: d7e8f9a0b1c2
Create Date: 2026-06-08
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "e8f9a0b1c2d3"
down_revision: Union[str, Sequence[str], None] = "d7e8f9a0b1c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES = ("metric_definitions", "semantic_model_fields")


def upgrade() -> None:
    for table in _TABLES:
        op.execute(
            f"""
            UPDATE {table} SET expression = jsonb_build_object(
              'dialects', jsonb_build_array(jsonb_build_object(
                'dialect', 'ANSI_SQL',
                'expression', expression -> 'dialects' ->> 'ANSI_SQL'
              ))
            )
            WHERE expression IS NOT NULL
              AND jsonb_typeof(expression -> 'dialects') = 'object'
              AND expression -> 'dialects' ? 'ANSI_SQL'
            """
        )


def downgrade() -> None:
    for table in _TABLES:
        op.execute(
            f"""
            UPDATE {table} SET expression = jsonb_build_object(
              'dialects', jsonb_build_object(
                'ANSI_SQL', expression -> 'dialects' -> 0 ->> 'expression'
              )
            )
            WHERE expression IS NOT NULL
              AND jsonb_typeof(expression -> 'dialects') = 'array'
            """
        )
