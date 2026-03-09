"""Job schemas."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class JobCreate(BaseModel):
    document_id: str
    pipeline_id: str | None = None


class JobEvent(BaseModel):
    type: str
    at: datetime | None = None


class JobResponse(BaseModel):
    id: int
    queue_name: str
    task_name: str
    status: str
    args: dict[str, Any] = {}
    scheduled_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    attempts: int = 0
    created_at: datetime | None = None
    events: list[JobEvent] = []


class JobListResponse(BaseModel):
    items: list[JobResponse]
    total: int
