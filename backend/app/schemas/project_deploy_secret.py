"""Schemas for project deploy secrets (values write-only)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ProjectDeploySecretCreate(BaseModel):
    name: str = Field(min_length=1, max_length=253)
    cluster_id: str = Field(min_length=1, max_length=64)
    namespace: str = Field(default="default", max_length=253)
    values: dict[str, str] = Field(default_factory=dict)


class ProjectDeploySecretUpdate(BaseModel):
    cluster_id: str | None = Field(default=None, max_length=64)
    namespace: str | None = Field(default=None, max_length=253)
    set_values: dict[str, str] = Field(default_factory=dict)
    remove_keys: list[str] = Field(default_factory=list)


class ProjectDeploySecretResponse(BaseModel):
    id: str
    project_id: str
    name: str
    cluster_id: str | None
    namespace: str
    key_names: list[str]
    last_synced_at: datetime | None = None
    last_sync_error: str | None = None
    created_at: datetime
    updated_at: datetime
