"""Knowledge base — wiki space join (pages indexed into KB chunks for RAG)."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class KBWikiSpace(Base):
    """Many-to-many: which wiki spaces contribute pages to a knowledge base index."""

    __tablename__ = "kb_wiki_spaces"
    __table_args__ = (
        UniqueConstraint("knowledge_base_id", "wiki_space_id", name="uq_kb_wiki_space"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    knowledge_base_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    wiki_space_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("wiki_spaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
