"""Ontology Apps — App Builder authored apps (resources + runnable artifact)."""

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AppBuilderApp(Base):
    """Published or draft A2UI app bound to ontology Object Types / Actions / Functions."""

    __tablename__ = "ontology_apps"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    api_name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    template_id: Mapped[str] = mapped_column(String(64), nullable=False, default="a2ui", server_default="a2ui")
    bindings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    draft_a2ui: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    published_a2ui: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    bindings_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft", server_default="draft")
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
