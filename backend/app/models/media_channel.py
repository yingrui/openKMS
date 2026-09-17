"""Media channel tree for image and video collections."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MediaChannel(Base):
    __tablename__ = "media_channels"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    parent_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("media_channels.id", ondelete="CASCADE"), nullable=True, index=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    metadata_schema: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # 结构化元数据提取配置(与文档频道对齐)。
    extraction_model_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("api_models.id", ondelete="SET NULL"), nullable=True
    )
    extraction_schema: Mapped[list | None] = mapped_column(JSON, nullable=True)
    label_config: Mapped[list | None] = mapped_column(JSON, nullable=True)
    object_type_extraction_max_instances: Mapped[int | None] = mapped_column(
        Integer, nullable=True, server_default="100"
    )
    default_image_model_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("api_models.id", ondelete="SET NULL"), nullable=True
    )
    default_video_model_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("api_models.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    parent: Mapped["MediaChannel | None"] = relationship(
        "MediaChannel", remote_side=[id], back_populates="children"
    )
    children: Mapped[list["MediaChannel"]] = relationship(
        "MediaChannel", back_populates="parent", cascade="all, delete-orphan"
    )
