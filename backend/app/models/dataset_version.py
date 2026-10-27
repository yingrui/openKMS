"""File datasets: an immutable, numbered version of a set of files.

A table dataset is "whatever the source has now". A file dataset is a **published snapshot**: the
version is an integer (v1, v2), assembled as a draft and frozen by publishing, and its manifest lists
the files that make it up. Files are immutable objects in the platform bucket; a later version
reuses the ones it did not change instead of copying them.

Kept apart from `datasets` because a version has its own lifecycle (draft → published →
deprecated) and its own numbers, and because almost every existing query about a dataset is about
the dataset, not about a version of it.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DatasetVersion(Base):
    """One numbered snapshot of a file dataset."""

    __tablename__ = "dataset_versions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: Auto-increment per dataset. It *is* the version — "v3", no business label.
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: draft (still being assembled) | published (frozen) | deprecated (frozen, kept forever)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    #: Written at publish; null while a draft, which is why a draft cannot be pinned.
    manifest_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: Recorded, not enforced: what a reader should expect (`[{name, type}]`). Written into the
    #: manifest as "schema"; the column is named `columns` because `schema` shadows pydantic's.
    columns: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    file_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    row_count: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default="0"
    )
    byte_size: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default="0"
    )
    date_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    date_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (UniqueConstraint("dataset_id", "version", name="uq_dataset_version"),)


class DatasetVersionFile(Base):
    """A file belonging to a version: immutable, addressed by key, described by its own metadata."""

    __tablename__ = "dataset_version_files"

    version_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("dataset_versions.id", ondelete="CASCADE"), primary_key=True
    )
    name: Mapped[str] = mapped_column(String(256), primary_key=True)
    storage_key: Mapped[str] = mapped_column(Text, nullable=False)
    #: sha256 of the bytes — proves a download is intact, not that two datasets hold the same data.
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    #: Columns as recorded when the file was added, so the version's schema needs no file read.
    columns: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    rows: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    date_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    date_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    #: One line about the file, written once at upload — "trade_date 2026-01-05 → 2026-01-30" when a date column
    #: was recognised, nothing otherwise. A **field**, so the UI renders it instead of composing it, and the manifest
    #: copies it instead of deriving it a second time.
    description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    #: Set when this version reused an earlier version's file instead of uploading a new one.
    reused_from_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
