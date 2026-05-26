"""Add connectors toggle; remove legacy content-area toggles.

Revision ID: v4w5x6y7z8a0
Revises: u3v4w5x6y7z8
Create Date: 2026-05-25
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "v4w5x6y7z8a0"
down_revision: Union[str, Sequence[str], None] = "u3v4w5x6y7z8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_LEGACY = ("articles", "knowledgeBases", "wikiSpaces", "objectsAndLinks", "knowledge_map")


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "feature_toggles" not in insp.get_table_names():
        return
    conn.execute(
        sa.text(
            "INSERT INTO feature_toggles (key, enabled) SELECT 'connectors', true "
            "WHERE NOT EXISTS (SELECT 1 FROM feature_toggles WHERE key = 'connectors')"
        )
    )
    for k in _LEGACY:
        conn.execute(sa.text("DELETE FROM feature_toggles WHERE key = :k"), {"k": k})


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "feature_toggles" not in insp.get_table_names():
        return
    conn.execute(sa.text("DELETE FROM feature_toggles WHERE key = 'connectors'"))
    defaults = {
        "articles": True,
        "knowledgeBases": True,
        "wikiSpaces": True,
        "objectsAndLinks": True,
        "knowledge_map": True,
    }
    for key, enabled in defaults.items():
        conn.execute(
            sa.text(
                "INSERT INTO feature_toggles (key, enabled) SELECT :k, :e "
                "WHERE NOT EXISTS (SELECT 1 FROM feature_toggles WHERE key = :k)"
            ),
            {"k": key, "e": enabled},
        )
