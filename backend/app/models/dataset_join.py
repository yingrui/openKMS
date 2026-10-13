"""Dataset relationship model — Ossie-style foreign keys between datasets (many → one).

The table keeps its historical name `dataset_joins`; semantically it stores an **Ossie
relationship**: `from` (the many side, holds the FK) → `to` (the one side, key columns).
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DatasetJoin(Base):
    """An Ossie relationship: a foreign key from `from` (many) to `to` (one)."""

    __tablename__ = "dataset_joins"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    from_dataset_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    to_dataset_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # FK columns on the `from` side, order-aligned with `to_columns`.
    from_columns: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    # Referenced key columns on the `to` side.
    to_columns: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    # SQL join type used by the metric engine: left | inner | right | full.
    join_type: Mapped[str] = mapped_column(String(8), nullable=False, default="left")
    ai_context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
