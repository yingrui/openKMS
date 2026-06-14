"""Central schedule registry — one row per schedulable target (e.g. connector sync)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

SCHEDULE_KIND_CONNECTOR_SYNC = "connector_sync"
SCHEDULE_KIND_PROJECT_AGENT_STATELESS = "project_agent_stateless"
SCHEDULE_KIND_PROJECT_AGENT_STATEFUL = "project_agent_stateful"

PROJECT_AGENT_SCHEDULE_KINDS = frozenset(
    {
        SCHEDULE_KIND_PROJECT_AGENT_STATELESS,
        SCHEDULE_KIND_PROJECT_AGENT_STATEFUL,
    }
)


class ScheduledTrigger(Base):
    __tablename__ = "scheduled_triggers"
    __table_args__ = (UniqueConstraint("kind", "target_id", name="uq_scheduled_triggers_kind_target"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    target_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(256), nullable=False)
    cron: Mapped[str | None] = mapped_column(String(128), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, server_default="UTC")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    last_fired_slot: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    last_job_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
