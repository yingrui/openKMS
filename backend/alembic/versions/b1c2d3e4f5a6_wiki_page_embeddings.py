"""wiki_pages: embedding vector + model id for semantic search

Revision ID: b1c2d3e4f5a6
Revises: c9d0e1f2a3b4
Create Date: 2026-05-07

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE wiki_pages ADD COLUMN IF NOT EXISTS embedding vector"))
    conn.execute(sa.text("ALTER TABLE wiki_pages ADD COLUMN IF NOT EXISTS embedding_model_id VARCHAR(64)"))
    conn.execute(sa.text("ALTER TABLE wiki_pages ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ"))
    conn.execute(
        sa.text(
            """
            DO $$
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'wiki_pages_embedding_model_id_fkey'
              ) THEN
                ALTER TABLE wiki_pages
                  ADD CONSTRAINT wiki_pages_embedding_model_id_fkey
                  FOREIGN KEY (embedding_model_id) REFERENCES api_models(id) ON DELETE SET NULL;
              END IF;
            END $$;
            """
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE wiki_pages DROP CONSTRAINT IF EXISTS wiki_pages_embedding_model_id_fkey"))
    conn.execute(sa.text("ALTER TABLE wiki_pages DROP COLUMN IF EXISTS embedded_at"))
    conn.execute(sa.text("ALTER TABLE wiki_pages DROP COLUMN IF EXISTS embedding_model_id"))
    conn.execute(sa.text("ALTER TABLE wiki_pages DROP COLUMN IF EXISTS embedding"))
