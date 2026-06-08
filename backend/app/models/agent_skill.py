"""Global agent skills registry (shared across projects)."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _id() -> str:
    return str(uuid4())


class AgentSkill(Base):
    __tablename__ = "agent_skills"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    """Skill slug, e.g. openkms."""

    display_name: Mapped[str] = mapped_column(String(256), nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    default_version: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    versions: Mapped[list["AgentSkillVersion"]] = relationship(
        "AgentSkillVersion",
        back_populates="skill",
        cascade="all, delete-orphan",
        order_by="AgentSkillVersion.created_at.desc()",
    )


class AgentSkillVersion(Base):
    __tablename__ = "agent_skill_versions"
    __table_args__ = (UniqueConstraint("skill_id", "version", name="uq_agent_skill_versions_skill_version"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    skill_id: Mapped[str] = mapped_column(String(64), ForeignKey("agent_skills.id", ondelete="CASCADE"), nullable=False, index=True)
    version: Mapped[str] = mapped_column(String(128), nullable=False)
    uploaded_by: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    uploaded_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    skill: Mapped["AgentSkill"] = relationship("AgentSkill", back_populates="versions")
