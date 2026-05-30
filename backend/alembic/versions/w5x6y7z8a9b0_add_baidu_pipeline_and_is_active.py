"""add_baidu_pipeline_and_is_active

Revision ID: w5x6y7z8a9b0
Revises: v4w5x6y7z8a0
Create Date: 2026-05-29

Add pipelines.is_active and seed Baidu Cloud Document Parse pipeline.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "w5x6y7z8a9b0"
down_revision: Union[str, None] = "v4w5x6y7z8a0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BAIDU_COMMAND = (
    "openkms-cli pipeline run --pipeline-name baidu-doc-parse "
    "--input {input} --s3-prefix {s3_prefix} --document-id {document_id} "
    "--api-url {api_url}{extraction_args}"
)


def _column_exists(conn, table: str, column: str) -> bool:
    insp = sa.inspect(conn)
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, "pipelines", "is_active"):
        op.add_column(
            "pipelines",
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        )

    op.execute(
        f"""
        INSERT INTO pipelines (id, name, description, command, default_args, is_active)
        VALUES (
            'pipeline_baidu_doc_parse',
            'Baidu Cloud Document Parse',
            'Parse documents via Baidu PaddleOCR-VL API (file_data upload)',
            '{BAIDU_COMMAND}',
            '{{"pipeline_name": "baidu-doc-parse"}}'::jsonb,
            true
        )
        ON CONFLICT (id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM pipelines WHERE id = 'pipeline_baidu_doc_parse'"))
    conn = op.get_bind()
    if _column_exists(conn, "pipelines", "is_active"):
        op.drop_column("pipelines", "is_active")
