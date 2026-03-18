"""DataSource model for PostgreSQL and Neo4j connection configs."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DataSource(Base):
    """Connection config to PostgreSQL or Neo4j. Username/password stored encrypted."""

    __tablename__ = "data_sources"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)  # postgresql | neo4j
    host: Mapped[str] = mapped_column(String(512), nullable=False)
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    database: Mapped[str | None] = mapped_column(String(256), nullable=True)
    username_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    password_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    options: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    datasets: Mapped[list["Dataset"]] = relationship(
        "Dataset", back_populates="data_source_rel", cascade="all, delete-orphan"
    )
