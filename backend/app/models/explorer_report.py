"""Explorer report model — persisted dashboard-like analysis in the Data Explorer app."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ExplorerReport(Base):
    """A saved analysis: a question, **one source** (dataset or semantic model), and live blocks.

    A block owns the query it came from, so the report can be re-run after the data changed; the
    rows/columns stored beside it are the result of the last run.
    """

    __tablename__ = "explorer_reports"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    question: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: dataset | semantic_model — decides which query spec a block carries.
    source_kind: Mapped[str] = mapped_column(
        String(16), nullable=False, default="dataset", server_default="dataset"
    )
    dataset_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    semantic_model_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("semantic_models.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")  # draft | ready
    narrative: Mapped[str | None] = mapped_column(Text, nullable=True)
    # [{ title, insight, query, columns: [...], rows: [...], error, ran_at }]
    blocks: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
