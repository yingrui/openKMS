"""Hierarchical taxonomy (KOS) and links to document channels, article channels, wiki spaces."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _id() -> str:
    return str(uuid4()).replace("-", "")[:32]


class TaxonomyNode(Base):
    __tablename__ = "taxonomy_nodes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_id)
    parent_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("taxonomy_nodes.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    children: Mapped[list["TaxonomyNode"]] = relationship(
        "TaxonomyNode",
        back_populates="parent",
        cascade="all, delete-orphan",
    )
    parent: Mapped["TaxonomyNode | None"] = relationship(
        "TaxonomyNode",
        remote_side=[id],
        back_populates="children",
    )
    resource_links: Mapped[list["TaxonomyResourceLink"]] = relationship(
        "TaxonomyResourceLink", back_populates="node", cascade="all, delete-orphan"
    )


class TaxonomyResourceLink(Base):
    """Maps one content surface (channel or wiki space) to exactly one taxonomy node."""

    __tablename__ = "taxonomy_resource_links"
    __table_args__ = (UniqueConstraint("resource_type", "resource_id", name="uq_taxonomy_resource_links_type_id"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_id)
    taxonomy_node_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("taxonomy_nodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    resource_type: Mapped[str] = mapped_column(String(32), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    node: Mapped["TaxonomyNode"] = relationship("TaxonomyNode", back_populates="resource_links")
