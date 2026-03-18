"""Dataset model for PostgreSQL tables (schema + table)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Dataset(Base):
    """A table in a PostgreSQL DataSource. Can be mapped to ObjectType/LinkType later."""

    __tablename__ = "datasets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    data_source_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("data_sources.id", ondelete="CASCADE"), nullable=False, index=True
    )
    schema_name: Mapped[str] = mapped_column(String(128), nullable=False)
    table_name: Mapped[str] = mapped_column(String(256), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    data_source_rel: Mapped["DataSource"] = relationship("DataSource", back_populates="datasets")
