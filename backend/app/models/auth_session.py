"""Server-side browser sessions (BFF): opaque cookie id + encrypted tokens."""

from datetime import datetime

from sqlalchemy import DateTime, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuthSession(Base):
    """One browser session. The cookie holds only ``id``; tokens stay server-side (encrypted)."""

    __tablename__ = "auth_sessions"
    __table_args__ = (
        Index("ix_auth_sessions_user_sub", "user_sub"),
        Index("ix_auth_sessions_idle_expires_at", "idle_expires_at"),
    )

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_sub: Mapped[str] = mapped_column(String(512), nullable=False)
    idp_sub: Mapped[str | None] = mapped_column(String(512), nullable=True)
    auth_mode: Mapped[str] = mapped_column(String(16), nullable=False)

    access_token_enc: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    access_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    idle_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    absolute_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rotated_from: Mapped[str | None] = mapped_column(String(128), nullable=True)
    replaced_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
