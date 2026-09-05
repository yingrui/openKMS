"""Ontology Apps — App Builder authored apps (resources + artifacts)."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _id() -> str:
    return str(uuid4())


class AppBuilderApp(Base):
    """An authored app: identity + resource allowlist + a set of artifacts (components)."""

    __tablename__ = "ontology_apps"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_id)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    api_name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    template_id: Mapped[str] = mapped_column(String(64), nullable=False, default="a2ui", server_default="a2ui")
    bindings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    published_version_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    bindings_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft", server_default="draft")
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AppBuilderComponent(Base):
    """A draft artifact (one A2UI surface) belonging to an app."""

    __tablename__ = "app_components"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_id)
    app_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("ontology_apps.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    a2ui_messages: Mapped[list | dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AppBuilderPublishedVersion(Base):
    """Immutable snapshot of a published app (components + bindings) for rollback."""

    __tablename__ = "app_published_versions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_id)
    app_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("ontology_apps.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    components: Mapped[list | dict | None] = mapped_column(JSONB, nullable=True)
    bindings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
