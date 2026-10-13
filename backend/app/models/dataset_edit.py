"""Dataset row-edit audit model.

Every applied row edit (update / insert / delete) is recorded so operators can
see **who changed which rows when** — a prerequisite for editing external data.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DatasetEdit(Base):
    """One applied row operation on a dataset's backing table."""

    __tablename__ = "dataset_edits"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    op: Mapped[str] = mapped_column(String(16), nullable=False)  # insert | update | delete
    pk: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # primary-key values
    before: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # for update/delete
    after: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # for insert/update
    actor: Mapped[str | None] = mapped_column(String(512), nullable=True)
    actor_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
