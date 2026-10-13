"""Semantic model ↔ dataset membership (the model's dataset scope)."""
from __future__ import annotations

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SemanticModelDataset(Base):
    """Which datasets a semantic model covers (shared datasets, many-to-many)."""

    __tablename__ = "semantic_model_datasets"

    semantic_model_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("semantic_models.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )
    dataset_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("datasets.id", ondelete="CASCADE"), primary_key=True, index=True
    )
