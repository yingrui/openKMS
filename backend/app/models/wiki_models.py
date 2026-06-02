"""Wiki spaces, pages, and file attachments."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
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
    semantic_similarity_threshold: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=0.4,
        server_default="0.4",
        doc="Minimum cosine similarity (1 - pgvector cosine distance) for semantic page matches; 0–1.",
    )
    semantic_match_top_k: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=10,
        server_default="10",
        doc="Max semantic hits returned for the workspace tree API (>= 1).",
    )
    semantic_embedding_model_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("api_models.id", ondelete="SET NULL"),
        nullable=True,
        doc="Embedding ApiModel for this space; null uses global default embedding model.",
    )
    last_semantic_index_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        doc="Last successful completion of POST .../semantic-index for this space.",
    )
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
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
    linked_documents: Mapped[list["WikiSpaceDocument"]] = relationship(
        "WikiSpaceDocument", back_populates="space", cascade="all, delete-orphan"
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
    embedding = mapped_column(Vector(None), nullable=True, deferred=True)
    embedding_model_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("api_models.id", ondelete="SET NULL"), nullable=True, index=True
    )
    embedded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    space: Mapped["WikiSpace"] = relationship("WikiSpace", back_populates="pages")
    files: Mapped[list["WikiFile"]] = relationship("WikiFile", back_populates="page")


class WikiSpaceDocument(Base):
    """Link a channel Document to a wiki space (reference only)."""

    __tablename__ = "wiki_space_documents"
    __table_args__ = (UniqueConstraint("wiki_space_id", "document_id", name="uq_wiki_space_documents_space_doc"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_id)
    wiki_space_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("wiki_spaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    space: Mapped["WikiSpace"] = relationship("WikiSpace", back_populates="linked_documents")
    # document: use lazy query via id to avoid circular import; Document in app.models.document


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
