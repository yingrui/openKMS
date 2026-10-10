"""Schemas for module Apps (hosted Kubernetes Service) registry + runtime."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class AppBuilderK8sBinding(BaseModel):
    """Hosted HTTP Service. Stored under bindings.k8s."""

    cluster_id: str
    namespace: str
    service: str
    port: int
    path: str | None = None


class AppBuilderBindings(BaseModel):
    """Module app bindings (Kubernetes Service only)."""

    k8s: AppBuilderK8sBinding | None = None


AppKind = Literal["module"]


class AppBuilderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    api_name: str = Field(min_length=1, max_length=128)
    description: str | None = None
    template_id: str = "module"
    """Must be ``module`` (hosted Service)."""
    bindings: AppBuilderBindings | None = None


class AppBuilderUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    bindings: AppBuilderBindings | None = None


class AppBuilderResponse(BaseModel):
    id: str
    name: str
    api_name: str
    description: str | None = None
    template_id: str
    app_kind: str = "module"
    bindings: dict[str, Any]
    status: str
    bindings_hash: str | None = None
    bindings_stale: bool = False
    missing_bindings: list[str] = Field(default_factory=list)
    created_by: str | None = None
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime
    published_version: int | None = None
    has_draft: bool = False
    has_published: bool = False


class AppBuilderVersionOut(BaseModel):
    id: str
    version: int
    created_at: datetime
    created_by_name: str | None = None
    is_current: bool = False


class AppBuilderRunResponse(AppBuilderResponse):
    """Runtime document for Apps Run (module iframe; no A2UI components)."""

    pass
