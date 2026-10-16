"""One run of a dashboard: when, how long, and how it went.

The reports themselves keep their own last result (`ran_at`, `error`); this is the **document's**
history — "when was this last refreshed, and did it keep failing?" — which nothing else could answer.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ExplorerDashboardRun(Base):
    """A run of every report in a dashboard, with what came of it."""

    __tablename__ = "explorer_dashboard_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    dashboard_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("explorer_dashboards.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ran_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reports: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ran_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
