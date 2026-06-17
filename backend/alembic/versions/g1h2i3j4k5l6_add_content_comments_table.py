"""Add content_comments table for polymorphic user comments and ratings.

Revision ID: g1h2i3j4k5l6
Revises: f4a5b6c7d8e9
Create Date: 2026-06-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "g1h2i3j4k5l6"
down_revision: Union[str, None] = "f4a5b6c7d8e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "content_comments",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("resource_type", sa.String(length=32), nullable=False),
        sa.Column("resource_id", sa.String(length=64), nullable=False),
        sa.Column("parent_comment_id", sa.String(length=64), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.String(length=512), nullable=False),
        sa.Column("created_by_name", sa.String(length=256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "parent_comment_id IS NULL OR rank IS NULL",
            name="ck_content_comments_reply_no_rank",
        ),
        sa.CheckConstraint(
            "rank IS NULL OR (rank >= 0 AND rank <= 5)",
            name="ck_content_comments_rank_range",
        ),
        sa.ForeignKeyConstraint(
            ["parent_comment_id"],
            ["content_comments.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_content_comments_resource_type", "content_comments", ["resource_type"])
    op.create_index("ix_content_comments_resource_id", "content_comments", ["resource_id"])
    op.create_index(
        "ix_content_comments_resource_lookup",
        "content_comments",
        ["resource_type", "resource_id", "created_at"],
    )
    op.create_index("ix_content_comments_parent_comment_id", "content_comments", ["parent_comment_id"])
    op.create_index("ix_content_comments_created_by", "content_comments", ["created_by"])


def downgrade() -> None:
    op.drop_index("ix_content_comments_created_by", table_name="content_comments")
    op.drop_index("ix_content_comments_parent_comment_id", table_name="content_comments")
    op.drop_index("ix_content_comments_resource_lookup", table_name="content_comments")
    op.drop_index("ix_content_comments_resource_id", table_name="content_comments")
    op.drop_index("ix_content_comments_resource_type", table_name="content_comments")
    op.drop_table("content_comments")
