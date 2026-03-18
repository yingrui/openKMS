"""LinkType model for ontology relationship schema definitions."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
