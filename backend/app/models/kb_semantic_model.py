"""Knowledge base — semantic model join (scopes Catalog query for this KB's qa-agent)."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class KBSemanticModel(Base):
    """Many-to-many: which semantic models are in scope for a knowledge base's Q&A."""

    __tablename__ = "kb_semantic_models"
    __table_args__ = (
        UniqueConstraint("knowledge_base_id", "semantic_model_id", name="uq_kb_semantic_model"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    knowledge_base_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    semantic_model_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("semantic_models.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
