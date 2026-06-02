"""OIDC subject directory: sub → display fields, updated on login."""

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OidcIdentity(Base):
    __tablename__ = "oidc_identities"

    sub: Mapped[str] = mapped_column(String(512), primary_key=True)
    preferred_username: Mapped[str] = mapped_column(String(256), nullable=False, default="", index=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True, index=True)
    name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
