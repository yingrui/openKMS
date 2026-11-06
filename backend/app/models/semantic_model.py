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

#: `public` — any authenticated caller may read the model.
ACCESS_PUBLIC = "public"
#: `restricted` — reading requires a grant on one of the model's data resources.
ACCESS_RESTRICTED = "restricted"
#: The stored vocabulary. A value here appears in the API and in migrations, so UI copy,
#: schemas and external services must use the same words.
ACCESS_MODES = (ACCESS_PUBLIC, ACCESS_RESTRICTED)


class SemanticModel(Base):
    """A named semantic model (container of datasets + metrics + queries)."""

    __tablename__ = "semantic_models"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: `public` = any authenticated caller; `restricted` = a data-resource grant is required.
    access_mode: Mapped[str] = mapped_column(
        String(16), nullable=False, default="public", server_default="public"
    )
    ai_context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    @property
    def is_restricted(self) -> bool:
        """True when a data-resource grant is required to read this model.

        One predicate, so the fallback for a row written before the column existed lives in a
        single place instead of being re-derived (as `access_mode or "public"`) at every call
        site. The `access_mode` value is compared against the module constant, not a literal
        repeated per caller.
        """
        return (self.access_mode or ACCESS_PUBLIC) == ACCESS_RESTRICTED
