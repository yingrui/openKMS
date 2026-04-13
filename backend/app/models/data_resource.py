"""Named data resources: KV attributes interpreted as access predicates (with group grants)."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> str:
    return str(uuid4())


class DataResource(Base):
    """Admin-defined policy object: resource_kind + JSONB attributes (whitelisted keys per kind)."""

    __tablename__ = "data_resources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(256), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    resource_kind: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    attributes: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    anchor_channel_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("document_channels.id", ondelete="SET NULL"), nullable=True, index=True
    )
    anchor_knowledge_base_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("knowledge_bases.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    group_links: Mapped[list[AccessGroupDataResource]] = relationship(
        "AccessGroupDataResource", back_populates="resource", cascade="all, delete-orphan"
    )


class AccessGroupDataResource(Base):
    __tablename__ = "access_group_data_resources"

    group_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("access_groups.id", ondelete="CASCADE"), primary_key=True
    )
    data_resource_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("data_resources.id", ondelete="CASCADE"), primary_key=True
    )

    group: Mapped["AccessGroup"] = relationship("AccessGroup", back_populates="data_resource_links")
    resource: Mapped[DataResource] = relationship("DataResource", back_populates="group_links")
