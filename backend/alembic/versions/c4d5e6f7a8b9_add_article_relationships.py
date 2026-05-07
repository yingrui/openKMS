"""add article_relationships

Revision ID: c4d5e6f7a8b9
Revises: b8592f60dc11
Create Date: 2026-04-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, None] = "b8592f60dc11"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "article_relationships",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("source_article_id", sa.String(length=64), nullable=False),
        sa.Column("target_article_id", sa.String(length=64), nullable=False),
        sa.Column("relation_type", sa.String(length=32), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["source_article_id"], ["articles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_article_id"], ["articles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_article_id",
            "target_article_id",
            "relation_type",
            name="uq_article_relationships_src_tgt_type",
        ),
    )
    op.create_index(
        "ix_article_relationships_source_article_id",
        "article_relationships",
        ["source_article_id"],
        unique=False,
    )
    op.create_index(
        "ix_article_relationships_target_article_id",
        "article_relationships",
        ["target_article_id"],
        unique=False,
    )
    op.create_index(
        "ix_article_relationships_relation_type",
        "article_relationships",
        ["relation_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_article_relationships_relation_type", table_name="article_relationships")
    op.drop_index("ix_article_relationships_target_article_id", table_name="article_relationships")
    op.drop_index("ix_article_relationships_source_article_id", table_name="article_relationships")
    op.drop_table("article_relationships")
