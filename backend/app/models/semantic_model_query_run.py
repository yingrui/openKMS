"""Audit row for a semantic-model query that used an ad-hoc expression or where/having."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SemanticModelQueryRun(Base):
    """One audited query API execution (especially temporary expression / where / having)."""

    __tablename__ = "semantic_model_query_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    semantic_model_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("semantic_models.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False)  # ok | error
    #: The granted data resource the query ran under (null for public models).
    data_resource_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    request: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    sql: Mapped[str | None] = mapped_column(Text, nullable=True)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    ran_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    ran_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
