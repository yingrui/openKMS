"""LinkInstance model for ontology link instances."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class LinkInstance(Base):
    """Single instance of a link type (e.g. COVID-19 covered by Health Plan A)."""

    __tablename__ = "link_instances"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    link_type_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("link_types.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_object_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("object_instances.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_object_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("object_instances.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
