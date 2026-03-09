"""ApiModel for external API provider/model registry."""
from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

MODEL_CATEGORIES = [
    ("ocr", "OCR APIs"),
    ("vl", "Vision-Language APIs"),
    ("llm", "LLM APIs"),
    ("embedding", "Embedding APIs"),
    ("text-classification", "Text Classification APIs"),
]


class ApiModel(Base):
    """Registered API endpoint / model provider."""

    __tablename__ = "api_models"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    provider: Mapped[str] = mapped_column(String(256), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    base_url: Mapped[str] = mapped_column(String(512), nullable=False)
    api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
