"""add wiki spaces, pages, files, group links, feature toggle

Revision ID: w7x8y9z0a1b2
Revises: d4e5f6g7h8i0
Create Date: 2026-04-13

Uses IF NOT EXISTS so the migration is safe when tables were already
created by Base.metadata.create_all().
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "w7x8y9z0a1b2"
down_revision: Union[str, Sequence[str], None] = "d4e5f6g7h8i0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS wiki_spaces (
            id              VARCHAR(64) PRIMARY KEY,
            name            VARCHAR(256) NOT NULL,
            description     TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS wiki_pages (
            id              VARCHAR(64) PRIMARY KEY,
            wiki_space_id   VARCHAR(64) NOT NULL REFERENCES wiki_spaces(id) ON DELETE CASCADE,
            path            VARCHAR(512) NOT NULL,
            title           VARCHAR(512) NOT NULL,
            body            TEXT NOT NULL,
            metadata        JSONB,
            page_index      JSONB,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_wiki_pages_space_path UNIQUE (wiki_space_id, path)
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_wiki_pages_wiki_space_id ON wiki_pages(wiki_space_id)"
    ))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS wiki_files (
            id              VARCHAR(64) PRIMARY KEY,
            wiki_space_id   VARCHAR(64) NOT NULL REFERENCES wiki_spaces(id) ON DELETE CASCADE,
            wiki_page_id    VARCHAR(64) REFERENCES wiki_pages(id) ON DELETE SET NULL,
            storage_key     VARCHAR(1024) NOT NULL UNIQUE,
            filename        VARCHAR(512) NOT NULL,
            content_type    VARCHAR(256),
            size_bytes      INTEGER NOT NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_wiki_files_wiki_space_id ON wiki_files(wiki_space_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_wiki_files_wiki_page_id ON wiki_files(wiki_page_id)"
    ))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS access_group_wiki_spaces (
            group_id        VARCHAR(36) NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,
            wiki_space_id   VARCHAR(64) NOT NULL REFERENCES wiki_spaces(id) ON DELETE CASCADE,
            PRIMARY KEY (group_id, wiki_space_id)
        )
    """))

    conn.execute(sa.text("""
        INSERT INTO feature_toggles (key, enabled)
        VALUES ('wikiSpaces', true)
        ON CONFLICT (key) DO NOTHING
    """))


def downgrade() -> None:
    op.execute("DELETE FROM feature_toggles WHERE key = 'wikiSpaces'")
    op.drop_table("access_group_wiki_spaces")
    op.drop_index("ix_wiki_files_wiki_page_id", table_name="wiki_files")
    op.drop_index("ix_wiki_files_wiki_space_id", table_name="wiki_files")
    op.drop_table("wiki_files")
    op.drop_index("ix_wiki_pages_wiki_space_id", table_name="wiki_pages")
    op.drop_table("wiki_pages")
    op.drop_table("wiki_spaces")
