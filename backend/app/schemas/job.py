"""Job schemas."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class JobCreate(BaseModel):
    document_id: str
    pipeline_id: str | None = None
    force_reparse: bool = Field(
        default=False,
        description="If false, reuse existing parse output on storage when present instead of running VLM parse again.",
    )


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
    worker_log: str | None = None
    worker_log_truncated: bool | None = None
    worker_log_char_limit: int | None = None


class JobListResponse(BaseModel):
    items: list[JobResponse]
    total: int
    limit: int
    offset: int
