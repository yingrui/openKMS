"""Access groups for data security (which resources a set of users may see)."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> str:
    return str(uuid4())


class AccessGroup(Base):
    __tablename__ = "access_groups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(256), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user_links: Mapped[list["AccessGroupUser"]] = relationship(
        "AccessGroupUser", back_populates="group", cascade="all, delete-orphan"
    )
    channel_links: Mapped[list["AccessGroupChannel"]] = relationship(
        "AccessGroupChannel", back_populates="group", cascade="all, delete-orphan"
    )
    kb_links: Mapped[list["AccessGroupKnowledgeBase"]] = relationship(
        "AccessGroupKnowledgeBase", back_populates="group", cascade="all, delete-orphan"
    )
    eval_links: Mapped[list["AccessGroupEvaluationDataset"]] = relationship(
        "AccessGroupEvaluationDataset", back_populates="group", cascade="all, delete-orphan"
    )
    dataset_links: Mapped[list["AccessGroupDataset"]] = relationship(
        "AccessGroupDataset", back_populates="group", cascade="all, delete-orphan"
    )
    object_type_links: Mapped[list["AccessGroupObjectType"]] = relationship(
        "AccessGroupObjectType", back_populates="group", cascade="all, delete-orphan"
    )
    link_type_links: Mapped[list["AccessGroupLinkType"]] = relationship(
        "AccessGroupLinkType", back_populates="group", cascade="all, delete-orphan"
    )


class AccessGroupUser(Base):
    __tablename__ = "access_group_users"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    group_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("access_groups.id", ondelete="CASCADE"), primary_key=True
    )

    group: Mapped["AccessGroup"] = relationship("AccessGroup", back_populates="user_links")


class AccessGroupChannel(Base):
    __tablename__ = "access_group_channels"

    group_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("access_groups.id", ondelete="CASCADE"), primary_key=True
    )
    channel_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("document_channels.id", ondelete="CASCADE"), primary_key=True
    )

    group: Mapped["AccessGroup"] = relationship("AccessGroup", back_populates="channel_links")


class AccessGroupKnowledgeBase(Base):
    __tablename__ = "access_group_knowledge_bases"

    group_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("access_groups.id", ondelete="CASCADE"), primary_key=True
    )
    knowledge_base_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("knowledge_bases.id", ondelete="CASCADE"), primary_key=True
    )

    group: Mapped["AccessGroup"] = relationship("AccessGroup", back_populates="kb_links")


class AccessGroupEvaluationDataset(Base):
    __tablename__ = "access_group_evaluation_datasets"

    group_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("access_groups.id", ondelete="CASCADE"), primary_key=True
    )
    evaluation_dataset_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("evaluation_datasets.id", ondelete="CASCADE"), primary_key=True
    )

    group: Mapped["AccessGroup"] = relationship("AccessGroup", back_populates="eval_links")


class AccessGroupDataset(Base):
    __tablename__ = "access_group_datasets"

    group_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("access_groups.id", ondelete="CASCADE"), primary_key=True
    )
    dataset_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("datasets.id", ondelete="CASCADE"), primary_key=True
    )

    group: Mapped["AccessGroup"] = relationship("AccessGroup", back_populates="dataset_links")


class AccessGroupObjectType(Base):
    __tablename__ = "access_group_object_types"

    group_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("access_groups.id", ondelete="CASCADE"), primary_key=True
    )
    object_type_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("object_types.id", ondelete="CASCADE"), primary_key=True
    )

    group: Mapped["AccessGroup"] = relationship("AccessGroup", back_populates="object_type_links")


class AccessGroupLinkType(Base):
    __tablename__ = "access_group_link_types"

    group_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("access_groups.id", ondelete="CASCADE"), primary_key=True
    )
    link_type_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("link_types.id", ondelete="CASCADE"), primary_key=True
    )

    group: Mapped["AccessGroup"] = relationship("AccessGroup", back_populates="link_type_links")
