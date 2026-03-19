"""add_labels_metadata_to_faqs_chunks_kb

Revision ID: t1u2v3w4x5y6
Revises: s5t6u7v8w9x0
Create Date: 2026-03-20

Add labels and doc_metadata to faqs and chunks;
label_keys and metadata_keys to knowledge_bases;
GIN indexes for filter queries.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "t1u2v3w4x5y6"
down_revision: Union[str, None] = "s5t6u7v8w9x0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("faqs", sa.Column("labels", JSONB(), nullable=True))
    op.add_column("faqs", sa.Column("doc_metadata", JSONB(), nullable=True))
    op.add_column("chunks", sa.Column("labels", JSONB(), nullable=True))
    op.add_column("chunks", sa.Column("doc_metadata", JSONB(), nullable=True))
    op.add_column("knowledge_bases", sa.Column("label_keys", JSONB(), nullable=True))
    op.add_column("knowledge_bases", sa.Column("metadata_keys", JSONB(), nullable=True))

    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_chunks_labels ON chunks USING GIN (labels)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_chunks_doc_metadata ON chunks USING GIN (doc_metadata)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_faqs_labels ON faqs USING GIN (labels)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_faqs_doc_metadata ON faqs USING GIN (doc_metadata)"))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_faqs_doc_metadata"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_faqs_labels"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_chunks_doc_metadata"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_chunks_labels"))
    op.drop_column("knowledge_bases", "metadata_keys")
    op.drop_column("knowledge_bases", "label_keys")
    op.drop_column("chunks", "doc_metadata")
    op.drop_column("chunks", "labels")
    op.drop_column("faqs", "doc_metadata")
    op.drop_column("faqs", "labels")
