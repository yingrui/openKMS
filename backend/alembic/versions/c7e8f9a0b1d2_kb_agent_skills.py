"""Add knowledge_bases.agent_skills for per-KB qa-agent skill selection.

Revision ID: c7e8f9a0b1d2
Revises: a1b2c3d4e5f0
Create Date: 2026-11-03
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "c7e8f9a0b1d2"
down_revision = "a1b2c3d4e5f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "knowledge_bases",
        sa.Column("agent_skills", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("knowledge_bases", "agent_skills")
