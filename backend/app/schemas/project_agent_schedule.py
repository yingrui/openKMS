"""Schemas for project agent schedules."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ScheduleMode = Literal["stateless", "stateful"]
OnRunCompleted = Literal["keep", "delete"]


class ProjectAgentScheduleCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=256)
    mode: ScheduleMode = "stateless"
    cron: str = Field(min_length=1, max_length=128)
    timezone: str = "UTC"
    prompt: str = Field(min_length=1, max_length=48000)
    enabled: bool = True
    plan_mode: bool = False
    on_run_completed: OnRunCompleted = "keep"
    conversation_id: str | None = Field(
        default=None,
        description="Required when mode is stateful — existing project conversation id.",
    )


class ProjectAgentSchedulePatch(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=256)
    cron: str | None = Field(default=None, max_length=128)
    timezone: str | None = None
    prompt: str | None = Field(default=None, min_length=1, max_length=48000)
    enabled: bool | None = None
    on_run_completed: OnRunCompleted | None = None


class ProjectAgentScheduleOut(BaseModel):
    id: str
    kind: str
    mode: ScheduleMode
    project_id: str
    conversation_id: str | None = None
    display_name: str
    cron: str | None = None
    timezone: str = "UTC"
    enabled: bool
    prompt: str
    plan_mode: bool = False
    on_run_completed: OnRunCompleted = "keep"
    next_run_at: datetime | None = None
    last_fired_slot: datetime | None = None
    last_run_at: datetime | None = None
    last_status: str | None = None
    last_job_id: int | None = None


class ProjectAgentScheduleRunNowResponse(BaseModel):
    job_id: int
