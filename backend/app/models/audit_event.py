"""What changed, who changed it, and whether it worked — the log that makes an incident readable.

Written by a middleware, not by handlers: a handler that must remember to log is a handler that will
forget, and the operations worth recording are exactly the ones nobody wants to think about afterwards.
Mutations only (POST / PUT / PATCH / DELETE) — reads are volume without a destruction story.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
    #: Who — the key's owner. A per-agent key makes this answer "which agent", not just "which person".
    actor_sub: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    actor_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    #: How they authenticated: local | oidc | api_key (null when the request never got that far).
    auth_mode: Mapped[str | None] = mapped_column(String(16), nullable=True)
    method: Mapped[str] = mapped_column(String(8), nullable=False)
    path: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    #: The response's status: 2xx changed something, 4xx/5xx did not. Both are worth knowing.
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    #: Coarse subject, from the path: `datasets` + the id when it looks like one.
    resource_type: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    resource_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    #: Room for what a handler knows and a middleware does not. Never a request body: bodies carry secrets.
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
