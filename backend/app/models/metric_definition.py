"""Metric definition model — declarative DSL over datasets (no arbitrary SQL)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MetricDefinition(Base):
    """A metric: aggregation over a dataset column, with filters, joins, and dimensions."""

    __tablename__ = "metric_definitions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    business_definition: Mapped[str | None] = mapped_column(Text, nullable=True)
    aggregation: Mapped[str] = mapped_column(String(16), nullable=False)  # count | sum | avg | min | max
    column_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    filters: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # [{column, op, value}]
    joins: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # [dataset_join id]
    dimensions: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # [column]
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
