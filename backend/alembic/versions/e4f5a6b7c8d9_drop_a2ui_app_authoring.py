"""Drop A2UI App authoring: remove non-module apps and app_components.

Revision ID: e4f5a6b7c8d9
Revises: d34a071fdf24
Create Date: 2026-10-10

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "e4f5a6b7c8d9"
down_revision: str | None = "d34a071fdf24"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Delete experimental A2UI apps (and cascade published versions / components).
    op.execute(
        sa.text(
            "DELETE FROM ontology_apps WHERE template_id IS DISTINCT FROM 'module'"
        )
    )
    op.execute(sa.text("DROP TABLE IF EXISTS app_components CASCADE"))
    op.alter_column(
        "ontology_apps",
        "template_id",
        existing_type=sa.String(length=64),
        server_default="module",
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "ontology_apps",
        "template_id",
        existing_type=sa.String(length=64),
        server_default="a2ui",
        existing_nullable=False,
    )
    op.create_table(
        "app_components",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column(
            "app_id",
            sa.String(length=64),
            sa.ForeignKey("ontology_apps.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(length=256), nullable=False, server_default=""),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("a2ui_messages", JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
