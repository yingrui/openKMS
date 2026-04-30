"""Article channel tree (no document parsing pipeline)."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ArticleChannel(Base):
    __tablename__ = "article_channels"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    parent_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("article_channels.id", ondelete="CASCADE"), nullable=True, index=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    parent: Mapped["ArticleChannel | None"] = relationship(
        "ArticleChannel", remote_side=[id], back_populates="children"
    )
    children: Mapped[list["ArticleChannel"]] = relationship(
        "ArticleChannel", back_populates="parent", cascade="all, delete-orphan"
    )
