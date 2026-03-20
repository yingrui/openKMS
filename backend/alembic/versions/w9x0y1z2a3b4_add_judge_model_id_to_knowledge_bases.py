"""add judge_model_id to knowledge_bases

Revision ID: w9x0y1z2a3b4
Revises: v8w9x0y1z2a3
Create Date: 2026-03-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "w9x0y1z2a3b4"
down_revision: Union[str, None] = "v8w9x0y1z2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "knowledge_bases",
        sa.Column(
            "judge_model_id",
            sa.String(64),
            sa.ForeignKey("api_models.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("knowledge_bases", "judge_model_id")
