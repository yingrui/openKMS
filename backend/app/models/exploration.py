"""Saved explorations: an object set with a name, and the layout it opens with.

Two tables, because they are two different things (Palantir's docs are explicit about the split):

* **`explorations`** — a saved session: which object type, which conditions, the layout, who owns it and whether
  it is private or shared. It stores **conditions, not results**: opening it re-evaluates against current data,
  which is what makes a shared link always show today's numbers.
* **`exploration_layouts`** — the layout alone, per object type, with `owner_sub` empty meaning "global". A
  personal default takes precedence over the global one; that is the only rule, so no ordering column is needed.

`layout` is `{charts, columns, sorts, perspective}` — the four things the layout editor can change, and the same
shape the URL carries. `perspective` is what decides whether an exploration opens on the charts or the table.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

#: Who can open a saved exploration. Sharing never widens data access: the reader still needs rights on the rows.
VISIBILITIES = ("private", "shared")


def _id() -> str:
    return uuid.uuid4().hex


class Exploration(Base):
    """A named object set: `object_type_id` + `filters`, opened with `layout`."""

    __tablename__ = "explorations"
    __table_args__ = (
        Index("ix_explorations_owner_type", "owner_sub", "object_type_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_id)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    object_type_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("object_types.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: `[{prop, op, value, via?}]` — the `f=` conditions, stored as data so they can be re-evaluated.
    filters: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    #: `{charts, columns, sorts, perspective}`.
    layout: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    visibility: Mapped[str] = mapped_column(String(16), nullable=False, default="private", server_default="private")
    owner_sub: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    owner_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ExplorationLayout(Base):
    """A layout for an object type: `owner_sub` set = that user's default, empty = the global default."""

    __tablename__ = "exploration_layouts"
    __table_args__ = (
        # One layout per (type, owner); `owner_sub = ''` stands for the global row because a UNIQUE constraint
        # treats NULLs as distinct, which would let two "global" layouts exist.
        UniqueConstraint("object_type_id", "owner_sub", name="uq_exploration_layouts_type_owner"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_id)
    object_type_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("object_types.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: Empty string = global. Not NULL, so uniqueness actually holds.
    owner_sub: Mapped[str] = mapped_column(String(512), nullable=False, default="", server_default="")
    layout: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
