"""wiki_space_documents, agent_conversations, agent_messages

Revision ID: a9b0c1d2e3f4
Revises: w0x1y2z3a4b5
Create Date: 2026-04-13

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a9b0c1d2e3f4"
down_revision: Union[str, Sequence[str], None] = "w0x1y2z3a4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS wiki_space_documents (
            id              VARCHAR(64) PRIMARY KEY,
            wiki_space_id   VARCHAR(64) NOT NULL REFERENCES wiki_spaces(id) ON DELETE CASCADE,
            document_id     VARCHAR(64) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_wiki_space_documents_space_doc UNIQUE (wiki_space_id, document_id)
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_wiki_space_documents_wiki_space_id ON wiki_space_documents(wiki_space_id)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_wiki_space_documents_document_id ON wiki_space_documents(document_id)"))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS agent_conversations (
            id              VARCHAR(64) PRIMARY KEY,
            user_sub        VARCHAR(256) NOT NULL,
            surface         VARCHAR(64) NOT NULL,
            context         JSONB NOT NULL DEFAULT '{}'::jsonb,
            title           VARCHAR(512),
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_agent_conversations_user_sub ON agent_conversations(user_sub)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_agent_conversations_surface ON agent_conversations(surface)"))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS agent_messages (
            id                  VARCHAR(64) PRIMARY KEY,
            conversation_id   VARCHAR(64) NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
            role                VARCHAR(32) NOT NULL,
            content             TEXT NOT NULL DEFAULT '',
            tool_calls          JSONB,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_agent_messages_conversation_id ON agent_messages(conversation_id)"))


def downgrade() -> None:
    op.drop_table("agent_messages")
    op.drop_table("agent_conversations")
    op.drop_table("wiki_space_documents")
