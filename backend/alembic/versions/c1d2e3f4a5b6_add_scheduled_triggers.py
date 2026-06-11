"""Add scheduled_triggers and backfill from connector sync_schedule.

Revision ID: c1d2e3f4a5b6
Revises: b0c1d2e3f4a5
Create Date: 2026-06-05
"""

from __future__ import annotations

import json
import uuid

import sqlalchemy as sa
from alembic import op

revision = "c1d2e3f4a5b6"
down_revision = "b0c1d2e3f4a5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scheduled_triggers",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("target_id", sa.String(length=64), nullable=False),
        sa.Column("display_name", sa.String(length=256), nullable=False),
        sa.Column("cron", sa.String(length=128), nullable=True),
        sa.Column("timezone", sa.String(length=64), server_default="UTC", nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("last_fired_slot", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status", sa.String(length=32), nullable=True),
        sa.Column("last_job_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("kind", "target_id", name="uq_scheduled_triggers_kind_target"),
    )
    op.create_index("ix_scheduled_triggers_kind", "scheduled_triggers", ["kind"])
    op.create_index("ix_scheduled_triggers_target_id", "scheduled_triggers", ["target_id"])

    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, name, kind, settings, enabled FROM connectors WHERE settings IS NOT NULL"
        )
    ).fetchall()

    for row in rows:
        settings = row.settings
        if isinstance(settings, str):
            settings = json.loads(settings)
        if not isinstance(settings, dict):
            continue
        sched = settings.get("sync_schedule")
        if not isinstance(sched, dict) or not sched.get("enabled"):
            continue
        cron = sched.get("cron")
        if not isinstance(cron, str) or not cron.strip():
            continue
        tz = sched.get("timezone") if isinstance(sched.get("timezone"), str) else "UTC"
        conn.execute(
            sa.text(
                """
                INSERT INTO scheduled_triggers (
                    id, kind, target_id, display_name, cron, timezone, enabled
                ) VALUES (
                    :id, 'connector_sync', :target_id, :display_name, :cron, :timezone, :enabled
                )
                ON CONFLICT ON CONSTRAINT uq_scheduled_triggers_kind_target DO NOTHING
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "target_id": row.id,
                "display_name": row.name,
                "cron": cron.strip(),
                "timezone": tz or "UTC",
                "enabled": bool(row.enabled and sched.get("enabled")),
            },
        )


def downgrade() -> None:
    op.drop_index("ix_scheduled_triggers_target_id", table_name="scheduled_triggers")
    op.drop_index("ix_scheduled_triggers_kind", table_name="scheduled_triggers")
    op.drop_table("scheduled_triggers")
