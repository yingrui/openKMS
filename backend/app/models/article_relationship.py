"""Directed relationships between articles (lineage, amendments, etc.)."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ArticleRelationship(Base):
    """Edge: source_article_id -> target_article_id with a relation type."""

    __tablename__ = "article_relationships"
    __table_args__ = (
        UniqueConstraint(
            "source_article_id",
            "target_article_id",
            "relation_type",
            name="uq_article_relationships_src_tgt_type",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_article_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("articles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_article_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("articles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    relation_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
