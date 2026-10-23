"""ObjectType model for ontology schema definitions."""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ObjectType(Base):
    """Schema definition for a real-world entity type (e.g. Disease, InsuranceProduct)."""

    __tablename__ = "object_types"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False, unique=True)
    # The name code and Cypher use for this type (`client("WorkItem")`, `MATCH (n:WorkItem)`).
    # Fixed at creation: published Function source holds it as a string. `name` is the label
    # people see and may change. NULL only on rows created before the column existed.
    api_name: Mapped[str | None] = mapped_column(
        String(128), nullable=True, unique=True, index=True
    )
    # Graph identity: assigned at creation, never rewritten. Renaming `name` must not orphan
    # the nodes already indexed under this label (see object_neo4j_store.object_label).
    neo4j_label: Mapped[str | None] = mapped_column(String(256), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    dataset_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    #: The properties that identify an object in its source table — one, or the columns of a
    #: composite key (e.g. ``["portfolio_id", "ts_code"]``). The API id is their encoded join.
    key_properties: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    is_master_data: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    display_property: Mapped[str | None] = mapped_column(String(128), nullable=True)  # Property for label picker display
    properties: Mapped[list[dict] | None] = mapped_column(
        JSONB, nullable=True, default=list
    )  # e.g. [{"name": "icd_code", "type": "string", "required": False}]
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
