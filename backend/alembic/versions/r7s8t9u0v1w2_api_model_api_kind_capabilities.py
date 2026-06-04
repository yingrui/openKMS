"""api_models: category -> api_kind, add capabilities text[]

Revision ID: r7s8t9u0v1w2
Revises: q6r7s8t9u0v1
Create Date: 2026-06-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "r7s8t9u0v1w2"
down_revision: Union[str, None] = "q6r7s8t9u0v1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    result = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c)"
        ),
        {"t": table_name, "c": column_name},
    )
    return bool(result.scalar())


def upgrade() -> None:
    conn = op.get_bind()

    if not _column_exists(conn, "api_models", "api_kind"):
        op.add_column("api_models", sa.Column("api_kind", sa.String(64), nullable=True))
    if not _column_exists(conn, "api_models", "capabilities"):
        op.add_column(
            "api_models",
            sa.Column(
                "capabilities",
                postgresql.ARRAY(sa.String(64)),
                nullable=False,
                server_default="{}",
            ),
        )

    if _column_exists(conn, "api_models", "category"):
        op.execute(
            """
            UPDATE api_models SET api_kind = 'chat-completions', capabilities = '{}'
            WHERE category = 'llm'
            """
        )
        op.execute(
            """
            UPDATE api_models SET api_kind = 'chat-completions',
                capabilities = ARRAY['vision', 'document-parse']
            WHERE category = 'vl'
            """
        )
        op.execute(
            """
            UPDATE api_models SET api_kind = 'custom',
                capabilities = ARRAY['document-parse']
            WHERE category = 'ocr'
            """
        )
        op.execute(
            """
            UPDATE api_models SET api_kind = 'embeddings', capabilities = '{}'
            WHERE category = 'embedding'
            """
        )
        op.execute(
            """
            UPDATE api_models SET api_kind = 'custom', capabilities = '{}'
            WHERE category = 'text-classification'
            """
        )
        op.execute(
            """
            UPDATE api_models SET api_kind = 'chat-completions', capabilities = '{}'
            WHERE api_kind IS NULL
            """
        )
        op.alter_column("api_models", "api_kind", nullable=False)
        op.drop_column("api_models", "category")


def downgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, "api_models", "category"):
        op.add_column("api_models", sa.Column("category", sa.String(64), nullable=True))

    if _column_exists(conn, "api_models", "api_kind"):
        op.execute(
            """
            UPDATE api_models SET category = 'llm'
            WHERE api_kind = 'chat-completions'
              AND NOT (capabilities @> ARRAY['vision'])
            """
        )
        op.execute(
            """
            UPDATE api_models SET category = 'vl'
            WHERE api_kind = 'chat-completions'
              AND (capabilities @> ARRAY['vision'])
            """
        )
        op.execute(
            """
            UPDATE api_models SET category = 'ocr'
            WHERE api_kind = 'custom' AND (capabilities @> ARRAY['document-parse'])
            """
        )
        op.execute(
            """
            UPDATE api_models SET category = 'embedding'
            WHERE api_kind = 'embeddings'
            """
        )
        op.execute(
            """
            UPDATE api_models SET category = 'text-classification'
            WHERE api_kind = 'custom' AND NOT (capabilities @> ARRAY['document-parse'])
            """
        )
        op.execute(
            """
            UPDATE api_models SET category = 'llm' WHERE category IS NULL
            """
        )
        op.alter_column("api_models", "category", nullable=False)
        op.drop_column("api_models", "capabilities")
        op.drop_column("api_models", "api_kind")
