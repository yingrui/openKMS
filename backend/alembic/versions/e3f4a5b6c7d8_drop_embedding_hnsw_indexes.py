"""Drop embedding HNSW indexes and restore dimensionless vector columns."""

from typing import Sequence, Union

from alembic import op

revision: str = "e3f4a5b6c7d8"
down_revision: Union[str, Sequence[str], None] = "d2e3f4a5b6c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_EMBEDDING_TABLES = ("chunks", "faqs", "wiki_pages")


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS wiki_pages_embedding_hnsw_idx")
    op.execute("DROP INDEX IF EXISTS faqs_embedding_hnsw_idx")
    op.execute("DROP INDEX IF EXISTS chunks_embedding_hnsw_idx")

    for table in _EMBEDDING_TABLES:
        op.execute(
            f"""
            DO $$
            BEGIN
              IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = '{table}'
                  AND column_name = 'embedding'
              ) THEN
                EXECUTE 'ALTER TABLE {table} ALTER COLUMN embedding TYPE vector USING embedding::vector';
              END IF;
            END $$;
            """
        )


def downgrade() -> None:
    pass
