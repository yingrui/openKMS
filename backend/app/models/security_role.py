"""Local security roles and permission assignments (operation authorization)."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> str:
    return str(uuid4())


class SecurityRole(Base):
    __tablename__ = "security_roles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    permissions: Mapped[list["SecurityRolePermission"]] = relationship(
        "SecurityRolePermission", back_populates="role", cascade="all, delete-orphan"
    )
    user_links: Mapped[list["UserSecurityRole"]] = relationship(
        "UserSecurityRole", back_populates="role", cascade="all, delete-orphan"
    )


class SecurityRolePermission(Base):
    __tablename__ = "security_role_permissions"
    __table_args__ = (UniqueConstraint("role_id", "permission_key", name="uq_security_role_perm"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    role_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("security_roles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    permission_key: Mapped[str] = mapped_column(String(128), nullable=False)

    role: Mapped["SecurityRole"] = relationship("SecurityRole", back_populates="permissions")


class UserSecurityRole(Base):
    __tablename__ = "user_security_roles"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("security_roles.id", ondelete="CASCADE"), primary_key=True
    )

    role: Mapped["SecurityRole"] = relationship("SecurityRole", back_populates="user_links")
