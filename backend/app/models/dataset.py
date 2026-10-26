"""Dataset model for PostgreSQL tables (schema + table)."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.data_source import DataSource


class Dataset(Base):
    """A dataset: a table in a PostgreSQL source (`kind='table'`), or a set of files in object
    storage (`kind='file'`, in which case versions live in `dataset_versions`)."""

    __tablename__ = "datasets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    data_source_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("data_sources.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: table = a table in a SQL source; file = immutable, versioned files in the platform bucket.
    kind: Mapped[str] = mapped_column(
        String(16), nullable=False, default="table", server_default="table"
    )
    # Table datasets only: their identity in the source. Null for a file dataset.
    schema_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    table_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_sub: Mapped[str | None] = mapped_column(String(512), nullable=True)
    domain: Mapped[str | None] = mapped_column(String(128), nullable=True)
    tags: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    business_definition: Mapped[str | None] = mapped_column(Text, nullable=True)
    sensitivity: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Row identity for editing (e.g. ["ts_code"] or ["ts_code","trade_date"]).
    primary_key_columns: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # Declared unique keys (list of column-name lists); relationship targets (1:1).
    unique_keys: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    # Agent grounding: {"instructions": str, "synonyms": [str], "examples": [str]}.
    ai_context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Row editing is opt-in per dataset (default off).
    is_editable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    data_source_rel: Mapped["DataSource"] = relationship("DataSource", back_populates="datasets")
