"""ApiProvider for OpenAI-compatible service providers."""
from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ApiProvider(Base):
    """Service provider (OpenAI, Anthropic, etc.) with base_url and api_key."""

    __tablename__ = "api_providers"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    base_url: Mapped[str] = mapped_column(String(512), nullable=False)
    api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    models: Mapped[list["ApiModel"]] = relationship(
        "ApiModel", back_populates="provider_rel", cascade="all, delete-orphan"
    )
