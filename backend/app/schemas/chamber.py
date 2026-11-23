"""Schemas for Chamber apps (hosted Kubernetes Service) registry + runtime."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class ChamberK8sBinding(BaseModel):
    """Hosted HTTP Service. Stored under bindings.k8s."""

    cluster_id: str
    namespace: str
    service: str
    port: int
    path: str | None = None


class ChamberBindings(BaseModel):
    """Module app bindings (Kubernetes Service only)."""

    k8s: ChamberK8sBinding | None = None


AppKind = Literal["module"]


class ChamberCreate(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    api_name: str = Field(min_length=1, max_length=128)
    description: str | None = None
    template_id: AppKind = "module"
    """Only ``module`` (hosted Service) is supported."""
    bindings: ChamberBindings | None = None


class ChamberUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    bindings: ChamberBindings | None = None


class ChamberResponse(BaseModel):
    id: str
    name: str
    api_name: str
    description: str | None = None
    template_id: AppKind
    bindings: dict[str, Any]
    bindings_stale: bool = False
    missing_bindings: list[str] = Field(default_factory=list)
    created_by: str | None = None
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime
