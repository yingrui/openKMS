"""Article channel tree (no document parsing pipeline)."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
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
    review_model_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("api_models.id", ondelete="SET NULL"), nullable=True
    )
    review_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    review_criteria: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # 结构化元数据提取配置(与文档频道对齐)。
    extraction_model_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("api_models.id", ondelete="SET NULL"), nullable=True
    )
    extraction_schema: Mapped[list | None] = mapped_column(JSON, nullable=True)
    label_config: Mapped[list | None] = mapped_column(JSON, nullable=True)
    object_type_extraction_max_instances: Mapped[int | None] = mapped_column(
        Integer, nullable=True, server_default="100"
    )
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    parent: Mapped["ArticleChannel | None"] = relationship(
        "ArticleChannel", remote_side=[id], back_populates="children"
    )
    children: Mapped[list["ArticleChannel"]] = relationship(
        "ArticleChannel", back_populates="parent", cascade="all, delete-orphan"
    )
