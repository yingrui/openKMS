"""drop chamber published versions

Chamber is a launcher: registering an app is its only state, so the version layer is gone. The table and its two
columns held bindings snapshots that nothing read, and that the save path overwrote (see tmp/plan/chamber.md —
decision D57). Dropping them removes the vocabulary, not a capability.

`chamber_apps.status` keeps its column: existing rows say `draft`/`published` and nothing reads the value any more,
but dropping a column that a running deployment's rows still carry is a second, unrelated migration. Its default
moves to `registered` so new rows do not invent a lifecycle that no longer exists.

Revision ID: 08327ca4c4fe
Revises: wf14issues
Create Date: 2026-11-22 23:44:08.198292

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "08327ca4c4fe"
down_revision: Union[str, Sequence[str], None] = "wf14issues"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index(
        op.f("ix_chamber_published_versions_app_id"), table_name="chamber_published_versions"
    )
    op.drop_table("chamber_published_versions")
    op.drop_column("chamber_apps", "published_version_id")
    op.drop_column("chamber_apps", "bindings_hash")
    op.alter_column(
        "chamber_apps",
        "status",
        existing_type=sa.String(length=32),
        server_default="registered",
    )


def downgrade() -> None:
    op.alter_column(
        "chamber_apps",
        "status",
        existing_type=sa.String(length=32),
        server_default="draft",
    )
    op.add_column(
        "chamber_apps", sa.Column("bindings_hash", sa.String(length=128), nullable=True)
    )
    op.add_column(
        "chamber_apps", sa.Column("published_version_id", sa.String(length=64), nullable=True)
    )
    op.create_table(
        "chamber_published_versions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("app_id", sa.String(length=64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("components", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("bindings", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_by", sa.String(length=512), nullable=True),
        sa.Column("created_by_name", sa.String(length=256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["app_id"], ["chamber_apps.id"], ondelete="CASCADE"),
    )
    op.create_index(
        op.f("ix_chamber_published_versions_app_id"),
        "chamber_published_versions",
        ["app_id"],
        unique=False,
    )
