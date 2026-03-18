"""ObjectInstance model for ontology object instances."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ObjectInstance(Base):
    """Single instance of an object type (e.g. Disease 'COVID-19')."""

    __tablename__ = "object_instances"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    object_type_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("object_types.id", ondelete="CASCADE"), nullable=False, index=True
    )
    data: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=dict)  # property values
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
