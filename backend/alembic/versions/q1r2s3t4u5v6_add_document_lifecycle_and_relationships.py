"""add document lifecycle columns and document_relationships

Revision ID: q1r2s3t4u5v6
Revises: a1b2c3d4e5f7
Create Date: 2026-04-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "q1r2s3t4u5v6"
down_revision: Union[str, None] = "a1b2c3d4e5f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    doc_cols = {c["name"] for c in insp.get_columns("documents")}

    if "series_id" not in doc_cols:
        op.add_column("documents", sa.Column("series_id", sa.String(64), nullable=True))
    if "effective_from" not in doc_cols:
        op.add_column("documents", sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True))
    if "effective_to" not in doc_cols:
        op.add_column("documents", sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True))
    if "lifecycle_status" not in doc_cols:
        op.add_column("documents", sa.Column("lifecycle_status", sa.String(32), nullable=True))

    op.execute(sa.text("UPDATE documents SET series_id = id WHERE series_id IS NULL"))
    op.alter_column("documents", "series_id", nullable=False)

    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_documents_series_id ON documents (series_id)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_documents_lifecycle_status ON documents (lifecycle_status)"))

    if not insp.has_table("document_relationships"):
        op.create_table(
            "document_relationships",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column(
                "source_document_id",
                sa.String(64),
                sa.ForeignKey("documents.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "target_document_id",
                sa.String(64),
                sa.ForeignKey("documents.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("relation_type", sa.String(32), nullable=False),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.UniqueConstraint(
                "source_document_id",
                "target_document_id",
                "relation_type",
                name="uq_document_relationships_src_tgt_type",
            ),
        )
        op.execute(
            sa.text(
                "CREATE INDEX IF NOT EXISTS ix_document_relationships_source_document_id "
                "ON document_relationships (source_document_id)"
            )
        )
        op.execute(
            sa.text(
                "CREATE INDEX IF NOT EXISTS ix_document_relationships_target_document_id "
                "ON document_relationships (target_document_id)"
            )
        )
        op.execute(
            sa.text(
                "CREATE INDEX IF NOT EXISTS ix_document_relationships_relation_type "
                "ON document_relationships (relation_type)"
            )
        )
    else:
        op.execute(
            sa.text(
                "CREATE INDEX IF NOT EXISTS ix_document_relationships_source_document_id "
                "ON document_relationships (source_document_id)"
            )
        )
        op.execute(
            sa.text(
                "CREATE INDEX IF NOT EXISTS ix_document_relationships_target_document_id "
                "ON document_relationships (target_document_id)"
            )
        )
        op.execute(
            sa.text(
                "CREATE INDEX IF NOT EXISTS ix_document_relationships_relation_type "
                "ON document_relationships (relation_type)"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if insp.has_table("document_relationships"):
        op.execute(sa.text("DROP INDEX IF EXISTS ix_document_relationships_relation_type"))
        op.execute(sa.text("DROP INDEX IF EXISTS ix_document_relationships_target_document_id"))
        op.execute(sa.text("DROP INDEX IF EXISTS ix_document_relationships_source_document_id"))
        op.drop_table("document_relationships")

    op.execute(sa.text("DROP INDEX IF EXISTS ix_documents_lifecycle_status"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_documents_series_id"))

    doc_cols = {c["name"] for c in insp.get_columns("documents")}
    if "lifecycle_status" in doc_cols:
        op.drop_column("documents", "lifecycle_status")
    if "effective_to" in doc_cols:
        op.drop_column("documents", "effective_to")
    if "effective_from" in doc_cols:
        op.drop_column("documents", "effective_from")
    if "series_id" in doc_cols:
        op.drop_column("documents", "series_id")
