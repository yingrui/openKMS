"""bootstrap documents and document_channels

Revision ID: f0e1d2c3b4a5
Revises:
Create Date: 2026-04-23

Historical note: later migrations assumed these tables already existed (they were
once created via create_all or a lost migration). Fresh databases need this root
before add_description_to_document_channels (c8ac08f77d6d).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "f0e1d2c3b4a5"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    # Required before migrations that use the `vector` type (e.g. knowledge base tables).
    op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS vector"))

    insp = sa.inspect(bind)

    if not insp.has_table("document_channels"):
        op.create_table(
            "document_channels",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("name", sa.String(256), nullable=False),
            sa.Column(
                "parent_id",
                sa.String(64),
                sa.ForeignKey("document_channels.id", ondelete="CASCADE"),
                nullable=True,
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index(
            "ix_document_channels_parent_id",
            "document_channels",
            ["parent_id"],
            unique=False,
        )
        # Fresh check for documents (avoid stale inspector cache after DDL).
        insp = sa.inspect(bind)

    if not insp.has_table("documents"):
        op.create_table(
            "documents",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("name", sa.String(512), nullable=False),
            sa.Column("file_type", sa.String(32), nullable=False),
            sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("channel_id", sa.String(64), nullable=False),
            sa.Column("file_hash", sa.String(128), nullable=True),
            sa.Column("markdown", sa.Text(), nullable=True),
            sa.Column("parsing_result", postgresql.JSONB(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_documents_channel_id", "documents", ["channel_id"], unique=False)
        op.create_index("ix_documents_file_hash", "documents", ["file_hash"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if insp.has_table("documents"):
        op.drop_index("ix_documents_file_hash", table_name="documents")
        op.drop_index("ix_documents_channel_id", table_name="documents")
        op.drop_table("documents")
    if insp.has_table("document_channels"):
        op.drop_index("ix_document_channels_parent_id", table_name="document_channels")
        op.drop_table("document_channels")
