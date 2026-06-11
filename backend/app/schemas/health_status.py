"""Console health status schemas."""

from datetime import datetime
from typing import Literal

# re-export for API modules
__all__ = [
    "HealthStatusKind",
    "HealthComponent",
    "DataSourceHealthItem",
    "ProcessInstanceHealth",
    "HealthStatusResponse",
]

from pydantic import BaseModel, Field

HealthStatusKind = Literal["ok", "error", "skipped", "degraded"]


class HealthComponent(BaseModel):
    id: str
    label: str
    status: HealthStatusKind
    message: str | None = None
    latency_ms: int | None = None


class DataSourceHealthItem(BaseModel):
    id: str
    name: str
    kind: str
    host: str
    port: int | None = None
    status: HealthStatusKind
    message: str | None = None
    latency_ms: int | None = None


class ProcessInstanceHealth(BaseModel):
    role: Literal["worker", "scheduler"]
    instance_id: str
    label: str
    status: HealthStatusKind
    last_seen_at: datetime | None = None
    message: str | None = None


class HealthStatusResponse(BaseModel):
    checked_at: datetime
    overall: HealthStatusKind
    components: list[HealthComponent] = Field(default_factory=list)
    process_instances: list[ProcessInstanceHealth] = Field(default_factory=list)
    data_sources: list[DataSourceHealthItem] = Field(default_factory=list)
