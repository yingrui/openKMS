"""Dashboard model — a saved analysis: a question, a narrative, and the reports in it."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Dashboard(Base):
    """A dashboard — the document, not the tiles.

    Each **report** in it owns its source (a dataset *or* a semantic model), the query it came from,
    and the result of its last run. So one dashboard can put a model metric beside a raw-dataset
    health check, and re-running it re-runs each report through its own engine.
    """

    __tablename__ = "dashboards"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    question: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")  # draft | ready
    narrative: Mapped[str | None] = mapped_column(Text, nullable=True)
    # [{ title, insight, source_kind, dataset_id | semantic_model_id, query, chart, columns, rows, … }]
    reports: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
