"""ObjectType model for ontology schema definitions."""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ObjectType(Base):
    """Schema definition for a real-world entity type (e.g. Disease, InsuranceProduct)."""

    __tablename__ = "object_types"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    dataset_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    key_property: Mapped[str | None] = mapped_column(String(128), nullable=True)  # Property name used as primary/ID
    is_master_data: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    display_property: Mapped[str | None] = mapped_column(String(128), nullable=True)  # Property for label picker display
    properties: Mapped[list[dict] | None] = mapped_column(
        JSONB, nullable=True, default=list
    )  # e.g. [{"name": "icd_code", "type": "string", "required": False}]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
