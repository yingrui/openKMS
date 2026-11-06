"""A Catalog resource: a named data capability over one semantic model.

`resource_restricted` models are reachable **only** through a resource grant; a resource may
carry a row policy that the data layer injects on the model's base table. Nothing here
decides *who* may use the resource — that is the ACL entry (`resource_acl_entries` with
`resource_type = 'data_resource'`).
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _uuid() -> str:
    return str(uuid4())


class DataResource(Base):
    """A slice of a semantic model: same tables, optional row scope."""

    __tablename__ = "data_resources"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    semantic_model_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("semantic_models.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    #: The table the row policy applies to (must be a dataset of the model).
    base_dataset_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    #: `[]` (whole base table) or `[{column, op, value|claim}]`, ANDed into every query.
    row_policy: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
