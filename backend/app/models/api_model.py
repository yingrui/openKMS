"""ApiModel for external API provider/model registry."""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

API_KINDS = [
    ("chat-completions", "Chat completions"),
    ("embeddings", "Embeddings"),
    ("custom", "Custom endpoint"),
    ("image-generate", "Image generation"),
    ("video-generate", "Video generation"),
]

MODEL_CAPABILITIES = [
    ("vision", "Vision"),
    ("tools", "Tools"),
    ("thinking", "Thinking"),
    ("document-parse", "Document parse"),
    ("image-generate", "Image generation"),
    ("video-generate", "Video generation"),
]

VALID_API_KINDS = frozenset(k for k, _ in API_KINDS)
VALID_CAPABILITIES = frozenset(c for c, _ in MODEL_CAPABILITIES)


def model_has_capability(capabilities: list[str] | None, capability: str) -> bool:
    return capability in (capabilities or [])


class ApiModel(Base):
    """Model under a service provider. Inherits base_url/api_key from provider."""

    __tablename__ = "api_models"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    provider_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("api_providers.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    api_kind: Mapped[str] = mapped_column(String(64), nullable=False)
    capabilities: Mapped[list[str]] = mapped_column(
        ARRAY(String(64)), nullable=False, server_default="{}"
    )
    is_default_in_category: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    model_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    provider_rel: Mapped["ApiProvider"] = relationship("ApiProvider", back_populates="models")
