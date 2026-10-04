"""KubernetesCluster schemas."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class KubernetesClusterCreate(BaseModel):
    name: str
    description: str | None = None
    default_namespace: str = "default"
    kubeconfig: str = Field(..., min_length=1)
    options: dict[str, Any] | None = None


class KubernetesClusterUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    default_namespace: str | None = None
    kubeconfig: str | None = None  # None / empty = keep current
    options: dict[str, Any] | None = None


class KubernetesClusterResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    default_namespace: str
    api_server: str | None = None
    kubeconfig_configured: bool = True
    options: dict[str, Any] | None = None
    last_tested_at: datetime | None = None
    last_test_ok: bool | None = None
    created_at: datetime
    updated_at: datetime


class KubernetesClusterListResponse(BaseModel):
    items: list[KubernetesClusterResponse]
    total: int
    limit: int
    offset: int


class KubernetesNamespaceItem(BaseModel):
    name: str
    phase: str | None = None
    created_at: datetime | None = None


class KubernetesNamespaceListResponse(BaseModel):
    items: list[KubernetesNamespaceItem]


class KubernetesDeploymentItem(BaseModel):
    name: str
    namespace: str
    ready: str
    replicas: int
    available: int
    updated_at: datetime | None = None


class KubernetesDeploymentListResponse(BaseModel):
    namespace: str
    items: list[KubernetesDeploymentItem]


class KubernetesPodItem(BaseModel):
    name: str
    namespace: str
    phase: str
    ready: str
    restarts: int
    node: str | None = None
    created_at: datetime | None = None


class KubernetesPodListResponse(BaseModel):
    namespace: str
    items: list[KubernetesPodItem]
