"""KubernetesCluster schemas."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class KubernetesClusterCreate(BaseModel):
    name: str
    description: str | None = None
    default_namespace: str = "default"
    kubeconfig: str = Field(..., min_length=1)
    api_server: str | None = None  # empty / omit = use kubeconfig
    options: dict[str, Any] | None = None


class KubernetesClusterUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    default_namespace: str | None = None
    kubeconfig: str | None = None  # None / empty = keep current
    api_server: str | None = None  # None = keep; empty = use kubeconfig
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


class KubernetesServiceItem(BaseModel):
    name: str
    namespace: str
    type: str
    cluster_ip: str | None = None
    ports: str | None = None
    port_numbers: list[int] = []
    created_at: datetime | None = None


class KubernetesServiceListResponse(BaseModel):
    namespace: str
    items: list[KubernetesServiceItem]


class KubernetesContainerPort(BaseModel):
    container_port: int
    protocol: str = "TCP"
    name: str | None = None


class KubernetesServicePortDetail(BaseModel):
    name: str | None = None
    port: int
    target_port: str | None = None
    node_port: int | None = None
    protocol: str = "TCP"


class KubernetesServiceDetail(BaseModel):
    name: str
    namespace: str
    type: str
    cluster_ip: str | None = None
    external_ips: list[str] = []
    ports: list[KubernetesServicePortDetail] = []
    selector: dict[str, str] = {}
    created_at: datetime | None = None
    labels: dict[str, str] = {}


class KubernetesPodContainerDetail(BaseModel):
    name: str
    image: str | None = None
    ports: list[KubernetesContainerPort] = []
    ready: bool = False
    restarts: int = 0
    state: str = "unknown"


class KubernetesPodDetail(BaseModel):
    name: str
    namespace: str
    phase: str
    ready: str
    restarts: int
    node: str | None = None
    pod_ip: str | None = None
    created_at: datetime | None = None
    labels: dict[str, str] = {}
    containers: list[KubernetesPodContainerDetail] = []


class KubernetesManifestYamlResponse(BaseModel):
    kind: str
    name: str
    namespace: str
    yaml: str
    redacted: bool = False


class KubernetesApplyRequest(BaseModel):
    yaml: str = Field(min_length=1, max_length=262144)
    namespace: str | None = Field(default=None, max_length=253)


class KubernetesApplyItem(BaseModel):
    kind: str
    name: str
    namespace: str
    action: str


class KubernetesApplyResponse(BaseModel):
    items: list[KubernetesApplyItem]


class KubernetesDeleteRequest(BaseModel):
    kind: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=253)
    namespace: str | None = Field(default=None, max_length=253)


class KubernetesPodLogsResponse(BaseModel):
    namespace: str
    pod: str
    container: str | None = None
    log: str


class KubernetesSecretItem(BaseModel):
    name: str
    namespace: str
    type: str = "Opaque"
    keys: list[str] = []
    managed_by_project_id: str | None = None


class KubernetesSecretListResponse(BaseModel):
    namespace: str
    items: list[KubernetesSecretItem]


class KubernetesSecretUpsertRequest(BaseModel):
    set_values: dict[str, str] = Field(default_factory=dict)
    remove_keys: list[str] = Field(default_factory=list)


class KubernetesSecretUpsertResponse(KubernetesSecretItem):
    action: str


class KubernetesConfigMapItem(BaseModel):
    name: str
    namespace: str
    keys: list[str] = []
    data: dict[str, str] = Field(default_factory=dict)


class KubernetesConfigMapListResponse(BaseModel):
    namespace: str
    items: list[KubernetesConfigMapItem]


class KubernetesConfigMapUpsertRequest(BaseModel):
    set_values: dict[str, str] = Field(default_factory=dict)
    remove_keys: list[str] = Field(default_factory=list)


class KubernetesConfigMapUpsertResponse(KubernetesConfigMapItem):
    action: str


class KubernetesEnvValueFromSecret(BaseModel):
    name: str
    key: str
    optional: bool = False


class KubernetesEnvValueFromConfigMap(BaseModel):
    name: str
    key: str
    optional: bool = False


class KubernetesEnvValueFrom(BaseModel):
    secret_key_ref: KubernetesEnvValueFromSecret | None = None
    config_map_key_ref: KubernetesEnvValueFromConfigMap | None = None


class KubernetesEnvVar(BaseModel):
    name: str
    value: str | None = None
    value_from: KubernetesEnvValueFrom | None = None


class KubernetesEnvFromSecret(BaseModel):
    name: str
    optional: bool = False


class KubernetesEnvFromConfigMap(BaseModel):
    name: str
    optional: bool = False


class KubernetesEnvFrom(BaseModel):
    prefix: str | None = None
    secret_ref: KubernetesEnvFromSecret | None = None
    config_map_ref: KubernetesEnvFromConfigMap | None = None


class KubernetesContainerEnv(BaseModel):
    name: str
    image: str | None = None
    ports: list[KubernetesContainerPort] = Field(default_factory=list)
    env: list[KubernetesEnvVar] = Field(default_factory=list)
    env_from: list[KubernetesEnvFrom] = Field(default_factory=list)


class KubernetesDeploymentEnvResponse(BaseModel):
    name: str
    namespace: str
    containers: list[KubernetesContainerEnv]


class KubernetesDeploymentEnvPatchRequest(BaseModel):
    container: str = Field(min_length=1, max_length=253)
    env: list[KubernetesEnvVar] = Field(default_factory=list)
    env_from: list[KubernetesEnvFrom] = Field(default_factory=list)
