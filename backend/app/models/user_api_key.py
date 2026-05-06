"""Personal API keys for agent/script access (Bearer okms.{id}.{secret})."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _new_key_id() -> str:
    return str(uuid4())


class UserApiKey(Base):
    __tablename__ = "user_api_keys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_key_id)
    """UUID string; embedded in issued token as okms.{id}.{secret}."""

    owner_sub: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    """JWT subject: local user id or OIDC IdP sub."""

    auth_mode: Mapped[str] = mapped_column(String(16), nullable=False)
    """local | oidc — how owner_sub and permissions were resolved at creation."""

    name: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    """User-visible label."""

    key_prefix: Mapped[str] = mapped_column(String(32), nullable=False)
    """First characters of token for display (no secret)."""

    secret_hash: Mapped[str] = mapped_column(Text, nullable=False)
    """bcrypt hash of the secret segment only."""

    oidc_realm_roles: Mapped[list[Any] | None] = mapped_column(JSONB, nullable=True)
    """Snapshot of realm role names when key was created (OIDC only)."""

    display_username: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    display_email: Mapped[str] = mapped_column(String(320), nullable=False, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
