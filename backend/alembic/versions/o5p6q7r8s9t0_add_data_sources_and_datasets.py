"""add data_sources and datasets tables

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-03-18 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "o5p6q7r8s9t0"
down_revision: Union[str, Sequence[str], None] = "n4o5p6q7r8s9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "data_sources",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("host", sa.String(length=512), nullable=False),
        sa.Column("port", sa.Integer(), nullable=True),
        sa.Column("database", sa.String(length=256), nullable=True),
        sa.Column("username_encrypted", sa.Text(), nullable=False),
        sa.Column("password_encrypted", sa.Text(), nullable=True),
        sa.Column("options", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "datasets",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("data_source_id", sa.String(length=64), nullable=False),
        sa.Column("schema_name", sa.String(length=128), nullable=False),
        sa.Column("table_name", sa.String(length=256), nullable=False),
        sa.Column("display_name", sa.String(length=256), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["data_source_id"],
            ["data_sources.id"],
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        op.f("ix_datasets_data_source_id"),
        "datasets",
        ["data_source_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_datasets_data_source_id"), table_name="datasets")
    op.drop_table("datasets")
    op.drop_table("data_sources")
