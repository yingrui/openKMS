"""Saved query model — a model-level Ossie saved query (metrics + dimensions + filter)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SavedQuery(Base):
    """A saved query: metrics + group-by fields + filter over a base dataset's join graph."""

    __tablename__ = "saved_queries"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    base_dataset_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    metrics: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)  # [{name, metric_id}]
    group_by: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)  # [field name]
    joins: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)  # [dataset_join id]
    filters: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # [{column, op, value}]
    exports: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)  # ["view", ...]
    ai_context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
