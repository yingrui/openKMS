"""add system_settings table and console:settings API patterns

Revision ID: m8n9o0p1q2r4
Revises: x2y3z4a5b6c7
Create Date: 2026-04-14

Singleton row id=1: system_name, default_timezone, api_base_url_note.
Public GET /api/public/system; admin GET/PUT /api/system/settings (console:settings).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "m8n9o0p1q2r4"
down_revision: Union[str, None] = "x2y3z4a5b6c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "system_settings" not in insp.get_table_names():
        op.create_table(
            "system_settings",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("system_name", sa.String(256), nullable=False, server_default="openKMS"),
            sa.Column("default_timezone", sa.String(64), nullable=False, server_default="UTC"),
            sa.Column("api_base_url_note", sa.Text(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
    # Table may already exist from create_all(); ensure singleton row is present.
    op.execute(
        """
        INSERT INTO system_settings (id, system_name, default_timezone, api_base_url_note)
        SELECT 1, 'openKMS', 'UTC', NULL
        WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE id = 1)
        """
    )
    op.execute(
        """
        UPDATE security_permissions
        SET backend_api_patterns = '["GET /api/system/settings", "PUT /api/system/settings"]'::jsonb
        WHERE key = 'console:settings'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE security_permissions
        SET backend_api_patterns = '[]'::jsonb
        WHERE key = 'console:settings'
        """
    )
    op.execute("DROP TABLE IF EXISTS system_settings")
