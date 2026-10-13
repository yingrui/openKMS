"""Dataset field model — the Ossie semantic field layer over a dataset's columns.

A field is either a plain **column reference** or a **computed expression**; it
carries a `datatype` and an optional `dimension` role (`is_time`). Fields are the
unit metrics/queries select, and each can carry `ai_context`.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DatasetField(Base):
    """One semantic field on a dataset (column ref or computed expression)."""

    __tablename__ = "dataset_fields"
    __table_args__ = (
        UniqueConstraint("dataset_id", "name", name="uq_dataset_fields_dataset_name"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    # Physical column this field references (null ⇒ computed from `expression`).
    column_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    # Ossie expression: {"dialects": {"ANSI_SQL": "<fragment>"}}.
    expression: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    datatype: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Field role: {"is_time": bool}. null ⇒ a plain (non-dimension) field.
    dimension: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ai_context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
