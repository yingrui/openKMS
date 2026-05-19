"""kb wiki spaces and chunk wiki_page_id

Revision ID: 6d5e21be6a2f
Revises: d5e6f7a8b9c0
Create Date: 2026-05-19 14:05:30.633670

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "6d5e21be6a2f"
down_revision: Union[str, Sequence[str], None] = "d5e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "kb_wiki_spaces",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("knowledge_base_id", sa.String(length=64), nullable=False),
        sa.Column("wiki_space_id", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["knowledge_base_id"], ["knowledge_bases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["wiki_space_id"], ["wiki_spaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("knowledge_base_id", "wiki_space_id", name="uq_kb_wiki_space"),
    )
    op.create_index(op.f("ix_kb_wiki_spaces_knowledge_base_id"), "kb_wiki_spaces", ["knowledge_base_id"], unique=False)
    op.create_index(op.f("ix_kb_wiki_spaces_wiki_space_id"), "kb_wiki_spaces", ["wiki_space_id"], unique=False)

    op.add_column("chunks", sa.Column("wiki_page_id", sa.String(length=64), nullable=True))
    op.alter_column("chunks", "document_id", existing_type=sa.VARCHAR(length=64), nullable=True)
    op.create_index(op.f("ix_chunks_wiki_page_id"), "chunks", ["wiki_page_id"], unique=False)
    op.create_foreign_key(
        "fk_chunks_wiki_page_id_wiki_pages",
        "chunks",
        "wiki_pages",
        ["wiki_page_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_check_constraint(
        "ck_chunks_doc_or_wiki_page",
        "chunks",
        "(document_id IS NOT NULL AND wiki_page_id IS NULL) OR (document_id IS NULL AND wiki_page_id IS NOT NULL)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_chunks_doc_or_wiki_page", "chunks", type_="check")
    op.drop_constraint("fk_chunks_wiki_page_id_wiki_pages", "chunks", type_="foreignkey")
    op.drop_index(op.f("ix_chunks_wiki_page_id"), table_name="chunks")
    op.drop_column("chunks", "wiki_page_id")
    op.alter_column("chunks", "document_id", existing_type=sa.VARCHAR(length=64), nullable=False)

    op.drop_index(op.f("ix_kb_wiki_spaces_wiki_space_id"), table_name="kb_wiki_spaces")
    op.drop_index(op.f("ix_kb_wiki_spaces_knowledge_base_id"), table_name="kb_wiki_spaces")
    op.drop_table("kb_wiki_spaces")
