"""add_glossaries_tables

Revision ID: k7l8m9n0o1p2
Revises: 5a5219e2a381
Create Date: 2026-03-17

Create glossaries and glossary_terms tables.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "k7l8m9n0o1p2"
down_revision: Union[str, Sequence[str], None] = "5a5219e2a381"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS glossaries (
            id              VARCHAR(64) PRIMARY KEY,
            name            VARCHAR(256) NOT NULL,
            description     TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS glossary_terms (
            id              VARCHAR(64) PRIMARY KEY,
            glossary_id     VARCHAR(64) NOT NULL REFERENCES glossaries(id) ON DELETE CASCADE,
            primary_en      VARCHAR(512),
            primary_cn      VARCHAR(512),
            synonyms_en     JSONB,
            synonyms_cn     JSONB,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_glossary_terms_glossary_id ON glossary_terms(glossary_id)"
    ))


def downgrade() -> None:
    op.drop_table("glossary_terms")
    op.drop_table("glossaries")
