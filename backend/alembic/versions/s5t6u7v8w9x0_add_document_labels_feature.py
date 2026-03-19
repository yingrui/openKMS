"""add_document_labels_feature

Revision ID: s5t6u7v8w9x0
Revises: r2s3t4u5v6w7
Create Date: 2026-03-20

Add is_master_data and display_property to object_types;
label_config to document_channels; labels to documents.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON, JSONB

revision: str = "s5t6u7v8w9x0"
down_revision: Union[str, None] = "r2s3t4u5v6w7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("object_types", sa.Column("is_master_data", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("object_types", sa.Column("display_property", sa.String(128), nullable=True))

    op.add_column("document_channels", sa.Column("label_config", JSON(), nullable=True))

    op.add_column("documents", sa.Column("labels", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "labels")
    op.drop_column("document_channels", "label_config")
    op.drop_column("object_types", "display_property")
    op.drop_column("object_types", "is_master_data")
