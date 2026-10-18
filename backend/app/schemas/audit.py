"""Audit log read models."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class AuditEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    at: datetime
    actor_sub: str | None
    actor_name: str | None
    auth_mode: str | None
    method: str
    path: str
    status_code: int
    resource_type: str | None
    resource_id: str | None
    detail: dict[str, Any] | None


class AuditEventListResponse(BaseModel):
    items: list[AuditEventResponse]
    total: int
