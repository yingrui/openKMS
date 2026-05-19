"""Chunk model for knowledge base document segments."""
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Chunk(Base):
    """Chunk from a channel document or a wiki page; exactly one source is set."""

    __tablename__ = "chunks"
    __table_args__ = (
        CheckConstraint(
            "(document_id IS NOT NULL AND wiki_page_id IS NULL) OR "
            "(document_id IS NULL AND wiki_page_id IS NOT NULL)",
            name="ck_chunks_doc_or_wiki_page",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    knowledge_base_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("documents.id", ondelete="CASCADE"), nullable=True, index=True
    )
    wiki_page_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("wiki_pages.id", ondelete="CASCADE"), nullable=True, index=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    embedding = mapped_column(Vector(None), nullable=True)
    chunk_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    doc_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
