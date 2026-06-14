"""Central schedules hub API schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ScheduleKind = Literal[
    "connector_sync",
    "project_agent_stateless",
    "project_agent_stateful",
]
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
    project_id: str | None = Field(
        default=None,
        description="Set for project agent schedule rows.",
    )
    conversation_id: str | None = Field(
        default=None,
        description="Set for stateful project agent schedules.",
    )
    mode: Literal["stateless", "stateful"] | None = Field(
        default=None,
        description="Agent schedules only.",
    )


class ScheduleListResponse(BaseModel):
    items: list[ScheduleOut]
    total: int
    limit: int = 25
    offset: int = 0


class SchedulePatch(BaseModel):
    enabled: bool | None = None
    cron: str | None = None
    timezone: str | None = None
    prompt: str | None = Field(default=None, max_length=48000)


class ScheduleRunNowResponse(BaseModel):
    job_id: int
