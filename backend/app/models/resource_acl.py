"""Per-resource ACL entries (sharing & access control)."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _uuid() -> str:
    return str(uuid4())


class ResourceAclEntry(Base):
    """Direct ACL grant on a securable resource (inheritance computed at read time)."""

    __tablename__ = "resource_acl_entries"
    __table_args__ = (
        UniqueConstraint(
            "resource_type",
            "resource_id",
            "grantee_type",
            "grantee_id",
            name="uq_resource_acl_grantee",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    resource_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    grantee_type: Mapped[str] = mapped_column(String(32), nullable=False)
    grantee_id: Mapped[str | None] = mapped_column(String(320), nullable=True, index=True)
    grantee_label: Mapped[str | None] = mapped_column(String(320), nullable=True)
    permissions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
