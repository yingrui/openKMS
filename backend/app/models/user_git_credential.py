"""Encrypted HTTPS PAT credentials for remote git (per user)."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _id() -> str:
    return str(uuid4())


class UserGitCredential(Base):
    __tablename__ = "user_git_credentials"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_id)
    user_sub: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    username: Mapped[str] = mapped_column(String(256), nullable=False)
    encrypted_pat: Mapped[str] = mapped_column(Text, nullable=False)
    scopes_hint: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
