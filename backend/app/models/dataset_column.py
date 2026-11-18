"""Dataset column annotation — maintained per physical column (Catalog-owned).

Physical columns (name / type / nullable / ordinal) are read live from
`information_schema`; this table stores only what we add on top of them — today the
business **description** (authored by a data engineer or an Agent).
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DatasetColumn(Base):
    """Mutable annotation for one physical column of a dataset."""

    __tablename__ = "dataset_columns"
    __table_args__ = (
        UniqueConstraint("dataset_id", "column_name", name="uq_dataset_columns_dataset_column"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    column_name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # How this column's value is read as a time period (a strftime-style pattern). This is a fact about the
    # data — `2026-W47` is a week whatever model looks at it — so it lives with the column, not with a field,
    # and the calendar granularity is *derived* from it rather than declared beside it.
    time_format: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
