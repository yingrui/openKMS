"""Workforce skills: instruction bundles a digital employee may carry, authored inside openKMS.

A workforce skill is **not** an Agent Project skill package. The two registries are independent on
purpose: an Agent Project package is a zip a developer builds elsewhere and uploads as a whole,
while a workforce skill is written in the product (a `SKILL.md` plus optional Python scripts),
reviewed in the product as a draft, and published as an immutable version. Merging them would put
"uploaded archive" and "edited file tree" in one row and split every validation rule in two.

Only `SKILL.md`'s `description` is always in the prompt; the body and scripts are read on demand.
See `docs/features/workforce.md`.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

#: The editing row. Exactly one per skill; edited in place, last write wins.
SKILL_VERSION_DRAFT = "draft"
#: An immutable snapshot an agent may install.
SKILL_VERSION_PUBLISHED = "published"
#: No longer offered to new installs. Agents that already installed it keep working, and nothing
#: tells them: retiring a package is not a maintenance task we push onto its consumers.
SKILL_VERSION_DEPRECATED = "deprecated"


def _id() -> str:
    return str(uuid.uuid4())


class WorkforceSkill(Base):
    __tablename__ = "workforce_skills"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    """Slug, and the `name` the `SKILL.md` frontmatter must agree with."""

    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    versions: Mapped[list["WorkforceSkillVersion"]] = relationship(
        "WorkforceSkillVersion",
        back_populates="skill",
        cascade="all, delete-orphan",
    )


class WorkforceSkillVersion(Base):
    __tablename__ = "workforce_skill_versions"
    __table_args__ = (
        UniqueConstraint("skill_id", "version", name="uq_workforce_skill_versions_skill_version"),
        # At most one draft per skill. `published` and `deprecated` rows are history and repeat
        # their skill freely, so the uniqueness is scoped to the draft status.
        Index(
            "uq_workforce_skill_versions_draft",
            "skill_id",
            unique=True,
            postgresql_where=text("status = 'draft'"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    skill_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("workforce_skills.id", ondelete="CASCADE"), nullable=False, index=True
    )

    #: Registry-assigned and monotonic per skill ("1", "2", …). The `SKILL.md` frontmatter does not
    #: declare a version: two sources for one fact is how they drift apart.
    version: Mapped[str] = mapped_column(String(64), nullable=False)

    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=SKILL_VERSION_DRAFT, server_default=SKILL_VERSION_DRAFT
    )

    #: `{"<path>": "<text>"}`. Text only: a skill is instructions and Python, both of which the
    #: product edits. Binary assets are out of scope until something needs them.
    files: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    #: `scripts/*.py` — the one file the runtime expects to be runnable. Optional: a skill that only
    #: documents a procedure has no script, and that is the common case.
    entrypoint: Mapped[str | None] = mapped_column(String(256), nullable=True)
    #: Subcommands the entrypoint supports. Metadata: it tells the model how to call the script and
    #: lets publishing check that the file it names exists. It is not a permission list.
    subcommands: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    #: SHA-256 over the sorted `(path, content)` pairs, so two versions with the same files hash equal.
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    #: Total bytes of all files, kept for the list view so it does not have to measure JSONB.
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    published_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    skill: Mapped["WorkforceSkill"] = relationship("WorkforceSkill", back_populates="versions")
