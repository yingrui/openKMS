"""add evaluation_datasets and evaluation_dataset_items tables

Revision ID: u7v8w9x0y1z2
Revises: t1u2v3w4x5y6
Create Date: 2026-03-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "u7v8w9x0y1z2"
down_revision: Union[str, None] = "t1u2v3w4x5y6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "evaluation_datasets",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("knowledge_base_id", sa.String(64), sa.ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.execute("""
        INSERT INTO feature_toggles (key, enabled)
        VALUES ('evaluationDatasets', false)
        ON CONFLICT (key) DO NOTHING
    """)
    op.create_table(
        "evaluation_dataset_items",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("evaluation_dataset_id", sa.String(64), sa.ForeignKey("evaluation_datasets.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("expected_answer", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("evaluation_dataset_items")
    op.drop_table("evaluation_datasets")
    op.execute("DELETE FROM feature_toggles WHERE key = 'evaluationDatasets'")
