"""File datasets: `kind`, a nullable source identity, and the two version tables.

A dataset stops meaning "a table": `kind='file'` datasets hold immutable numbered versions of a set
of files in the platform bucket. See `docs/features/datasets-files.md`.

The built-in object-storage source is seeded here rather than created by a user: the deployment
already holds the bucket and credentials (`OPENKMS_S3_*`), so there is nothing to configure and
nothing to test.

Revision ID: d1f2a3b4c5d6
Revises: b2c3d4e5f6a8
"""

from __future__ import annotations

import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d1f2a3b4c5d6"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BUILTIN_ID = "00000000-0000-4000-8000-00000000f11e"
BUILTIN_NAME = "Object Storage"


def upgrade() -> None:
    op.add_column(
        "datasets",
        sa.Column("kind", sa.String(16), nullable=False, server_default="table"),
    )
    op.alter_column("datasets", "schema_name", existing_type=sa.String(128), nullable=True)
    op.alter_column("datasets", "table_name", existing_type=sa.String(256), nullable=True)
    # A table is unique per source; files are not identified by a table name at all.
    op.create_index(
        "uq_datasets_table_identity",
        "datasets",
        ["data_source_id", "schema_name", "table_name"],
        unique=True,
        postgresql_where=sa.text("kind = 'table'"),
    )

    op.create_table(
        "dataset_versions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "dataset_id",
            sa.String(64),
            sa.ForeignKey("datasets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="draft"),
        sa.Column("manifest_key", sa.Text(), nullable=True),
        sa.Column("columns", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("file_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("row_count", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("byte_size", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("date_from", sa.Date(), nullable=True),
        sa.Column("date_to", sa.Date(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(512), nullable=True),
        sa.Column("created_by_name", sa.String(256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("dataset_id", "version", name="uq_dataset_version"),
    )
    op.create_index("ix_dataset_versions_dataset_id", "dataset_versions", ["dataset_id"])

    op.create_table(
        "dataset_version_files",
        sa.Column(
            "version_id",
            sa.String(64),
            sa.ForeignKey("dataset_versions.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("name", sa.String(256), primary_key=True),
        sa.Column("storage_key", sa.Text(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("columns", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("rows", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("date_from", sa.Date(), nullable=True),
        sa.Column("date_to", sa.Date(), nullable=True),
        sa.Column("reused_from_version", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.execute(
        sa.text(
            """
            INSERT INTO data_sources (id, name, kind, host, port, database, username_encrypted,
                                      password_encrypted, options, layer)
            VALUES (:id, :name, 'object_storage', '', NULL, NULL, '', NULL,
                    CAST(:options AS jsonb), 'data')
            ON CONFLICT (id) DO NOTHING
            """
        ).bindparams(
            id=BUILTIN_ID,
            name=BUILTIN_NAME,
            options='{"builtin": true}',
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text("DELETE FROM data_sources WHERE id = :id AND kind = 'object_storage'").bindparams(
            id=BUILTIN_ID
        )
    )
    op.drop_table("dataset_version_files")
    op.drop_index("ix_dataset_versions_dataset_id", table_name="dataset_versions")
    op.drop_table("dataset_versions")
    op.drop_index("uq_datasets_table_identity", table_name="datasets")
    op.alter_column("datasets", "table_name", existing_type=sa.String(256), nullable=False)
    op.alter_column("datasets", "schema_name", existing_type=sa.String(128), nullable=False)
    op.drop_column("datasets", "kind")
