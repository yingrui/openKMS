"""Knowledge base model."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class KnowledgeBase(Base):
    """Knowledge base: groups documents, FAQs, and chunks for RAG Q&A."""

    __tablename__ = "knowledge_bases"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    embedding_model_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("api_models.id", ondelete="SET NULL"), nullable=True
    )
    judge_model_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("api_models.id", ondelete="SET NULL"), nullable=True
    )
    agent_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    chunk_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    faq_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_keys: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
