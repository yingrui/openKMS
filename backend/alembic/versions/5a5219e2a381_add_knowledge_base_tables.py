"""add_knowledge_base_tables

Revision ID: 5a5219e2a381
Revises: j2e3f4g5h6i7
Create Date: 2026-03-13

Create knowledge_bases, kb_documents, faqs, and chunks tables.
Uses IF NOT EXISTS so the migration is safe when tables were already
created by Base.metadata.create_all().
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "5a5219e2a381"
down_revision: Union[str, Sequence[str], None] = "j2e3f4g5h6i7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS knowledge_bases (
            id              VARCHAR(64) PRIMARY KEY,
            name            VARCHAR(256) NOT NULL,
            description     TEXT,
            embedding_model_id VARCHAR(64) REFERENCES api_models(id) ON DELETE SET NULL,
            agent_url       VARCHAR(512),
            chunk_config    JSONB,
            faq_prompt      TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    conn.execute(sa.text("""
        ALTER TABLE knowledge_bases
        ADD COLUMN IF NOT EXISTS faq_prompt TEXT
    """))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS kb_documents (
            id                  VARCHAR(64) PRIMARY KEY,
            knowledge_base_id   VARCHAR(64) NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
            document_id         VARCHAR(64) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_kb_document UNIQUE (knowledge_base_id, document_id)
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_kb_documents_knowledge_base_id ON kb_documents(knowledge_base_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_kb_documents_document_id ON kb_documents(document_id)"
    ))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS faqs (
            id                  VARCHAR(64) PRIMARY KEY,
            knowledge_base_id   VARCHAR(64) NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
            document_id         VARCHAR(64) REFERENCES documents(id) ON DELETE SET NULL,
            question            TEXT NOT NULL,
            answer              TEXT NOT NULL,
            embedding           vector,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_faqs_knowledge_base_id ON faqs(knowledge_base_id)"
    ))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS chunks (
            id                  VARCHAR(64) PRIMARY KEY,
            knowledge_base_id   VARCHAR(64) NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
            document_id         VARCHAR(64) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            content             TEXT NOT NULL,
            chunk_index         INTEGER NOT NULL DEFAULT 0,
            token_count         INTEGER,
            embedding           vector,
            chunk_metadata      JSONB,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_chunks_knowledge_base_id ON chunks(knowledge_base_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_chunks_document_id ON chunks(document_id)"
    ))


def downgrade() -> None:
    op.drop_table("chunks")
    op.drop_table("faqs")
    op.drop_table("kb_documents")
    op.drop_table("knowledge_bases")
