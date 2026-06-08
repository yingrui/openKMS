"""Add article channel review config and article_reviews table.

Revision ID: v1w2x3y4z5a6
Revises: u0v1w2x3y4z5
Create Date: 2026-06-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "v1w2x3y4z5a6"
down_revision: Union[str, None] = "u0v1w2x3y4z5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "article_channels",
        sa.Column("review_model_id", sa.String(length=64), nullable=True),
    )
    op.add_column("article_channels", sa.Column("review_prompt", sa.Text(), nullable=True))
    op.add_column(
        "article_channels",
        sa.Column("review_criteria", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.create_foreign_key(
        "fk_article_channels_review_model_id",
        "article_channels",
        "api_models",
        ["review_model_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "article_reviews",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("article_id", sa.String(length=64), nullable=False),
        sa.Column("review_model_id", sa.String(length=64), nullable=True),
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_by", sa.String(length=512), nullable=True),
        sa.Column("created_by_name", sa.String(length=256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["article_id"], ["articles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["review_model_id"], ["api_models.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_article_reviews_article_id", "article_reviews", ["article_id"])


def downgrade() -> None:
    op.drop_index("ix_article_reviews_article_id", table_name="article_reviews")
    op.drop_table("article_reviews")
    op.drop_constraint("fk_article_channels_review_model_id", "article_channels", type_="foreignkey")
    op.drop_column("article_channels", "review_criteria")
    op.drop_column("article_channels", "review_prompt")
    op.drop_column("article_channels", "review_model_id")
