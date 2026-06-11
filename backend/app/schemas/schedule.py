"""Central schedules hub API schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ScheduleKind = Literal["connector_sync"]
ScheduleStatusKind = Literal["queued", "running", "completed", "failed"]


class ScheduleOut(BaseModel):
    id: str
    kind: ScheduleKind
    target_id: str
    display_name: str
    cron: str | None = None
    timezone: str = "UTC"
    enabled: bool
    next_run_at: datetime | None = None
    last_fired_slot: datetime | None = None
    last_run_at: datetime | None = None
    last_status: str | None = None
    last_job_id: int | None = None
    connector_id: str | None = Field(
        default=None,
        description="Set for connector_sync rows (same as target_id).",
    )


class ScheduleListResponse(BaseModel):
    items: list[ScheduleOut]
    total: int


class SchedulePatch(BaseModel):
    enabled: bool | None = None
    cron: str | None = None
    timezone: str | None = None


class ScheduleRunNowResponse(BaseModel):
    job_id: int
