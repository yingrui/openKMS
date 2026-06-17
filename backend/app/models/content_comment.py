"""User comments and ratings on articles, documents, KBs, wiki spaces, and projects."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ContentComment(Base):
    __tablename__ = "content_comments"
    __table_args__ = (
        CheckConstraint(
            "parent_comment_id IS NULL OR rank IS NULL",
            name="ck_content_comments_reply_no_rank",
        ),
        CheckConstraint(
            "rank IS NULL OR (rank >= 0 AND rank <= 5)",
            name="ck_content_comments_rank_range",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    resource_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    resource_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    parent_comment_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("content_comments.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
