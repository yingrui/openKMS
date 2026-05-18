"""evaluation datasets: wiki_space_id; items: expected_page_paths (wiki_content_coverage target pages)

Revision ID: z9a8b7c6d5e4
Revises: e4f5a6b7c8d0
Create Date: 2026-05-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "z9a8b7c6d5e4"
down_revision: Union[str, None] = "e4f5a6b7c8d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "evaluation_datasets",
        sa.Column(
            "wiki_space_id",
            sa.String(64),
            sa.ForeignKey("wiki_spaces.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_evaluation_datasets_wiki_space_id",
        "evaluation_datasets",
        ["wiki_space_id"],
        unique=False,
    )
    op.add_column(
        "evaluation_dataset_items",
        sa.Column("expected_page_paths", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("evaluation_dataset_items", "expected_page_paths")
    op.drop_index("ix_evaluation_datasets_wiki_space_id", table_name="evaluation_datasets")
    op.drop_column("evaluation_datasets", "wiki_space_id")
