"""Metric definition model — a model-level Ossie metric backed by a SQL expression.

A metric is an **aggregate SQL fragment** (Ossie `expression.dialects`) anchored on
a base dataset and traversing registered relationships via `joins`. The engine
wraps the fragment into a generated query; no custom DSL.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MetricDefinition(Base):
    """A model-level metric: `expression` over a base dataset + relationship joins."""

    __tablename__ = "metric_definitions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    # The semantic model this metric belongs to (its scope).
    semantic_model_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("semantic_models.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # The dataset the metric is anchored on (the query's FROM).
    base_dataset_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    business_definition: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Ossie metric type (metadata): simple | ratio | derived | cumulative | conversion.
    type: Mapped[str] = mapped_column(String(32), nullable=False, default="simple")
    # Ossie expression: {"dialects": {"ANSI_SQL": "<aggregate fragment>"}}.
    expression: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    datatype: Mapped[str | None] = mapped_column(String(32), nullable=True)
    filters: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # [{column, op, value}]
    joins: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # [dataset_join id]
    ai_context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
