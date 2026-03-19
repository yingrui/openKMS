"""LinkType model for ontology relationship schema definitions."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# Cardinality: one-to-one (indicator, not enforced), one-to-many, many-to-one, many-to-many
CARDINALITY_CHOICES = ("one-to-one", "one-to-many", "many-to-one", "many-to-many")


class LinkType(Base):
    """Schema definition for a relationship between two object types."""

    __tablename__ = "link_types"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_object_type_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("object_types.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_object_type_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("object_types.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cardinality: Mapped[str] = mapped_column(
        String(32), nullable=False, default="one-to-many"
    )  # one-to-one | one-to-many | many-to-one | many-to-many
    dataset_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True, index=True
    )  # When many-to-many: links to the junction table dataset
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
