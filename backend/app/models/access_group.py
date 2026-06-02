"""Access groups for data security (members + resource ACL grants)."""

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

    user_links: Mapped[list["AccessGroupMember"]] = relationship(
        "AccessGroupMember",
        back_populates="group",
        cascade="all, delete-orphan",
        foreign_keys="AccessGroupMember.group_id",
    )


class AccessGroupMember(Base):
    __tablename__ = "access_group_members"

    subject: Mapped[str] = mapped_column(String(320), primary_key=True)
    group_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("access_groups.id", ondelete="CASCADE"), primary_key=True
    )

    group: Mapped["AccessGroup"] = relationship("AccessGroup", back_populates="user_links")
