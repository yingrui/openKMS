"""Article: markdown working copy + MinIO bundle under articles/{id}/."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    channel_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("article_channels.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(512), nullable=False)
    slug: Mapped[str | None] = mapped_column(String(256), nullable=True, index=True)
    markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    article_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    series_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    effective_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    effective_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lifecycle_status: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    origin_article_id: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
