"""unify_metadata_and_labels

Merge labels into metadata for documents, chunks, FAQs.
Merge label_keys into metadata_keys for knowledge_bases.
Add object_type_extraction_max_instances to document_channels.
Drop labels and label_keys columns.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "x1y2z3a4b5c6"
down_revision: Union[str, None] = "w9x0y1z2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Documents: merge labels into metadata, drop labels
    op.execute(
        sa.text("""
            UPDATE documents
            SET metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(labels, '{}'::jsonb)
            WHERE labels IS NOT NULL OR metadata IS NOT NULL
        """)
    )
    op.drop_column("documents", "labels")

    # Chunks: merge labels into doc_metadata, drop labels
    op.execute(
        sa.text("""
            UPDATE chunks
            SET doc_metadata = COALESCE(doc_metadata, '{}'::jsonb) || COALESCE(labels, '{}'::jsonb)
            WHERE labels IS NOT NULL OR doc_metadata IS NOT NULL
        """)
    )
    op.drop_column("chunks", "labels")

    # FAQs: merge labels into doc_metadata, drop labels
    op.execute(
        sa.text("""
            UPDATE faqs
            SET doc_metadata = COALESCE(doc_metadata, '{}'::jsonb) || COALESCE(labels, '{}'::jsonb)
            WHERE labels IS NOT NULL OR doc_metadata IS NOT NULL
        """)
    )
    op.drop_column("faqs", "labels")

    # Knowledge bases: merge label_keys into metadata_keys, drop label_keys
    op.execute(
        sa.text("""
            UPDATE knowledge_bases
            SET metadata_keys = COALESCE(metadata_keys, '[]'::jsonb) || COALESCE(label_keys, '[]'::jsonb)
            WHERE label_keys IS NOT NULL OR metadata_keys IS NOT NULL
        """)
    )
    op.drop_column("knowledge_bases", "label_keys")

    # Document channels: add object_type_extraction_max_instances
    op.add_column(
        "document_channels",
        sa.Column("object_type_extraction_max_instances", sa.Integer(), nullable=True, server_default="100"),
    )


def downgrade() -> None:
    # Document channels: drop object_type_extraction_max_instances
    op.drop_column("document_channels", "object_type_extraction_max_instances")

    # Knowledge bases: add label_keys back (empty - data loss)
    op.add_column("knowledge_bases", sa.Column("label_keys", JSONB(), nullable=True))

    # FAQs: add labels back (empty - data loss)
    op.add_column("faqs", sa.Column("labels", JSONB(), nullable=True))

    # Chunks: add labels back (empty - data loss)
    op.add_column("chunks", sa.Column("labels", JSONB(), nullable=True))

    # Documents: add labels back (empty - data loss)
    op.add_column("documents", sa.Column("labels", JSONB(), nullable=True))
