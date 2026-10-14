"""Semantic-model field — a model-scoped semantic attribute over a dataset column.

A field is the model-level projection of a column: a **column reference** or a
**computed expression**, plus a `datatype`, a `dimension` role (Ossie:
`time` / `categorical`, with `granularity` / `timezone` for time), an `entity`
(`foreign` / `primary` key), `description` and `ai_context`. The physical column
(and its `description`) lives with the dataset (Catalog); the field — its role and
interpretation — belongs to the semantic model.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SemanticModelField(Base):
    """One field of a semantic model (column ref or computed expression + role)."""

    __tablename__ = "semantic_model_fields"
    __table_args__ = (
        UniqueConstraint(
            "semantic_model_id", "dataset_id", "name", name="uq_semantic_model_fields_model_dataset_name"
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    semantic_model_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("semantic_models.id", ondelete="CASCADE"), nullable=False, index=True
    )
    dataset_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    # Physical column this field references (null ⇒ computed from `expression`).
    column_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    # Ossie expression: {"dialects": {"ANSI_SQL": "<fragment>"}}.
    expression: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    datatype: Mapped[str | None] = mapped_column(String(32), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Ossie dimension role: {"type": "time"|"categorical", "granularity"?, "timezone"?}.
    dimension: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Ossie entity (key): {"type": "foreign"|"primary", "name": ...}.
    entity: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ai_context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
