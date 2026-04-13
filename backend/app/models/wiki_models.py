"""Wiki spaces, pages, and file attachments."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _id() -> str:
    return str(uuid4())


class WikiSpace(Base):
    __tablename__ = "wiki_spaces"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_id)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    pages: Mapped[list["WikiPage"]] = relationship(
        "WikiPage", back_populates="space", cascade="all, delete-orphan"
    )
    files: Mapped[list["WikiFile"]] = relationship(
        "WikiFile", back_populates="space", cascade="all, delete-orphan"
    )


class WikiPage(Base):
    __tablename__ = "wiki_pages"
    __table_args__ = (UniqueConstraint("wiki_space_id", "path", name="uq_wiki_pages_space_path"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_id)
    wiki_space_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("wiki_spaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    path: Mapped[str] = mapped_column(String(512), nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    page_index: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    space: Mapped["WikiSpace"] = relationship("WikiSpace", back_populates="pages")
    files: Mapped[list["WikiFile"]] = relationship("WikiFile", back_populates="page")


class WikiFile(Base):
    __tablename__ = "wiki_files"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_id)
    wiki_space_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("wiki_spaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    wiki_page_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("wiki_pages.id", ondelete="SET NULL"), nullable=True, index=True
    )
    storage_key: Mapped[str] = mapped_column(String(1024), nullable=False, unique=True)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(256), nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    space: Mapped["WikiSpace"] = relationship("WikiSpace", back_populates="files")
    page: Mapped["WikiPage | None"] = relationship("WikiPage", back_populates="files")
