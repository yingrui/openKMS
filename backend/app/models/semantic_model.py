"""Semantic model — a named scope over the shared data layer (Ossie document).

Datasets, their fields, and relationships are **shared** (Catalog-owned). A
semantic model references a subset of datasets and owns the cross-dataset
artifacts: its **metrics** and **queries** (plus model-level `ai_context`).
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SemanticModel(Base):
    """A named semantic model (container of datasets + metrics + queries)."""

    __tablename__ = "semantic_models"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
