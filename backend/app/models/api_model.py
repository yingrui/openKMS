"""ApiModel for external API provider/model registry."""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

MODEL_CATEGORIES = [
    ("ocr", "OCR APIs"),
    ("vl", "Vision-Language APIs"),
    ("llm", "LLM APIs"),
    ("embedding", "Embedding APIs"),
    ("text-classification", "Text Classification APIs"),
]


class ApiModel(Base):
    """Model under a service provider. Inherits base_url/api_key from provider."""

    __tablename__ = "api_models"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    provider_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("api_providers.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    is_default_in_category: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    model_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    provider_rel: Mapped["ApiProvider"] = relationship("ApiProvider", back_populates="models")
