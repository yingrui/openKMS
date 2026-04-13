"""User-defined operation permissions (catalog rows in PostgreSQL)."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _uuid() -> str:
    return str(uuid4())


class SecurityPermission(Base):
    """A permission key with labels and route/API path patterns for operators and UI."""

    __tablename__ = "security_permissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    key: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    label: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    frontend_route_patterns: Mapped[list] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    backend_api_patterns: Mapped[list] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
