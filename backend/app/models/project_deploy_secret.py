"""Encrypted deploy secrets for Agent projects (synced to Kubernetes Opaque Secrets)."""
from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _id() -> str:
    return str(uuid4())


class ProjectDeploySecret(Base):
    __tablename__ = "project_deploy_secrets"
    __table_args__ = (UniqueConstraint("project_id", "name", name="uq_project_deploy_secrets_project_name"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_id)
    project_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(253), nullable=False)
    cluster_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("kubernetes_clusters.id", ondelete="SET NULL"), nullable=True, index=True
    )
    namespace: Mapped[str] = mapped_column(String(253), nullable=False, default="default")
    key_names: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    data_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_sync_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
