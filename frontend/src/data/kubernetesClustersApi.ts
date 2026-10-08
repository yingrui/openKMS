/** API for registered Kubernetes clusters. */
import { request } from './apiClient';

export interface KubernetesClusterResponse {
  id: string;
  name: string;
  description: string | null;
  default_namespace: string;
  api_server: string | null;
  kubeconfig_configured: boolean;
  options: Record<string, unknown> | null;
  last_tested_at: string | null;
  last_test_ok: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface KubernetesClusterListResponse {
  items: KubernetesClusterResponse[];
  total: number;
  limit: number;
  offset: number;
}

export async function fetchKubernetesClusters(params?: {
  limit?: number;
  offset?: number;
}): Promise<KubernetesClusterListResponse> {
  return request<KubernetesClusterListResponse>('/api/kubernetes-clusters', {
    query: { limit: params?.limit, offset: params?.offset },
  });
}

export async function createKubernetesCluster(data: {
  name: string;
  description?: string;
  default_namespace?: string;
    kubeconfig: string;
    api_server?: string | null;
    options?: Record<string, unknown>;
}): Promise<KubernetesClusterResponse> {
  return request<KubernetesClusterResponse>('/api/kubernetes-clusters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateKubernetesCluster(
  id: string,
  data: {
    name?: string;
    description?: string;
    default_namespace?: string;
    kubeconfig?: string;
    api_server?: string | null;
    options?: Record<string, unknown>;
  }
): Promise<KubernetesClusterResponse> {
  return request<KubernetesClusterResponse>(`/api/kubernetes-clusters/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteKubernetesCluster(id: string): Promise<void> {
  return request<void>(`/api/kubernetes-clusters/${id}`, { method: 'DELETE' });
}

export async function testKubernetesCluster(
  id: string
): Promise<{ ok: boolean; message: string }> {
  return request<{ ok: boolean; message: string }>(`/api/kubernetes-clusters/${id}/test`, {
    method: 'POST',
  });
}

export async function fetchKubernetesCluster(id: string): Promise<KubernetesClusterResponse> {
  return request<KubernetesClusterResponse>(`/api/kubernetes-clusters/${id}`);
}

export interface KubernetesNamespaceItem {
  name: string;
  phase: string | null;
  created_at: string | null;
}

export interface KubernetesDeploymentItem {
  name: string;
  namespace: string;
  ready: string;
  replicas: number;
  available: number;
  updated_at: string | null;
}

export interface KubernetesPodItem {
  name: string;
  namespace: string;
  phase: string;
  ready: string;
  restarts: number;
  node: string | null;
  created_at: string | null;
}

export interface KubernetesServiceItem {
  name: string;
  namespace: string;
  type: string;
  cluster_ip: string | null;
  ports: string | null;
  port_numbers?: number[];
  created_at: string | null;
}

export async function fetchClusterNamespaces(
  id: string
): Promise<{ items: KubernetesNamespaceItem[] }> {
  return request<{ items: KubernetesNamespaceItem[] }>(
    `/api/kubernetes-clusters/${id}/namespaces`
  );
}

export async function fetchClusterDeployments(
  id: string,
  namespace?: string
): Promise<{ namespace: string; items: KubernetesDeploymentItem[] }> {
  return request<{ namespace: string; items: KubernetesDeploymentItem[] }>(
    `/api/kubernetes-clusters/${id}/deployments`,
    { query: { namespace } }
  );
}

export async function fetchClusterPods(
  id: string,
  namespace?: string
): Promise<{ namespace: string; items: KubernetesPodItem[] }> {
  return request<{ namespace: string; items: KubernetesPodItem[] }>(
    `/api/kubernetes-clusters/${id}/pods`,
    { query: { namespace } }
  );
}

export async function fetchClusterServices(
  id: string,
  namespace?: string
): Promise<{ namespace: string; items: KubernetesServiceItem[] }> {
  return request<{ namespace: string; items: KubernetesServiceItem[] }>(
    `/api/kubernetes-clusters/${id}/services`,
    { query: { namespace } }
  );
}

export async function fetchClusterPodLogs(
  id: string,
  pod: string,
  params?: { namespace?: string; tail?: number; container?: string }
): Promise<{ namespace: string; pod: string; container: string | null; log: string }> {
  return request<{ namespace: string; pod: string; container: string | null; log: string }>(
    `/api/kubernetes-clusters/${id}/pods/${encodeURIComponent(pod)}/logs`,
    { query: { namespace: params?.namespace, tail: params?.tail, container: params?.container } }
  );
}

export interface KubernetesServicePortDetail {
  name?: string | null;
  port: number;
  target_port?: string | null;
  node_port?: number | null;
  protocol: string;
}

export interface KubernetesServiceDetail {
  name: string;
  namespace: string;
  type: string;
  cluster_ip: string | null;
  external_ips: string[];
  ports: KubernetesServicePortDetail[];
  selector: Record<string, string>;
  created_at: string | null;
  labels: Record<string, string>;
}

export interface KubernetesPodContainerDetail {
  name: string;
  image?: string | null;
  ports?: KubernetesContainerPort[];
  ready: boolean;
  restarts: number;
  state: string;
}

export interface KubernetesPodDetail {
  name: string;
  namespace: string;
  phase: string;
  ready: string;
  restarts: number;
  node: string | null;
  pod_ip: string | null;
  created_at: string | null;
  labels: Record<string, string>;
  containers: KubernetesPodContainerDetail[];
}

export async function fetchClusterPodDetail(
  id: string,
  pod: string,
  namespace?: string
): Promise<KubernetesPodDetail> {
  return request(`/api/kubernetes-clusters/${id}/pods/${encodeURIComponent(pod)}`, {
    query: { namespace },
  });
}

export async function fetchClusterServiceDetail(
  id: string,
  service: string,
  namespace?: string
): Promise<KubernetesServiceDetail> {
  return request(`/api/kubernetes-clusters/${id}/services/${encodeURIComponent(service)}`, {
    query: { namespace },
  });
}

export type KubernetesManifestKind =
  | 'Deployment'
  | 'Service'
  | 'Pod'
  | 'ConfigMap'
  | 'Secret';

export interface KubernetesManifestYaml {
  kind: string;
  name: string;
  namespace: string;
  yaml: string;
  redacted: boolean;
}

export async function fetchClusterManifestYaml(
  id: string,
  kind: KubernetesManifestKind,
  name: string,
  namespace?: string
): Promise<KubernetesManifestYaml> {
  return request(`/api/kubernetes-clusters/${id}/manifest`, {
    query: { kind, name, namespace },
  });
}

export async function applyClusterManifests(
  id: string,
  data: { yaml: string; namespace?: string }
): Promise<{ items: { kind: string; name: string; namespace: string; action: string }[] }> {
  return request(`/api/kubernetes-clusters/${id}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteClusterResource(
  id: string,
  data: { kind: string; name: string; namespace?: string }
): Promise<{ ok: boolean; kind: string; name: string; namespace: string }> {
  return request(`/api/kubernetes-clusters/${id}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export interface KubernetesSecretItem {
  name: string;
  namespace: string;
  type: string;
  keys: string[];
  managed_by_project_id: string | null;
}

export async function fetchClusterSecrets(
  id: string,
  namespace?: string
): Promise<{ namespace: string; items: KubernetesSecretItem[] }> {
  return request(`/api/kubernetes-clusters/${id}/secrets`, { query: { namespace } });
}

export async function upsertClusterSecret(
  id: string,
  name: string,
  body: { set_values: Record<string, string>; remove_keys?: string[] },
  namespace?: string
): Promise<KubernetesSecretItem & { action: string }> {
  return request(`/api/kubernetes-clusters/${id}/secrets/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    query: { namespace },
  });
}

export async function deleteClusterSecret(
  id: string,
  name: string,
  namespace?: string
): Promise<void> {
  return request(`/api/kubernetes-clusters/${id}/secrets/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    query: { namespace },
  });
}

export interface KubernetesConfigMapItem {
  name: string;
  namespace: string;
  keys: string[];
  data: Record<string, string>;
}

export async function fetchClusterConfigMaps(
  id: string,
  namespace?: string
): Promise<{ namespace: string; items: KubernetesConfigMapItem[] }> {
  return request(`/api/kubernetes-clusters/${id}/configmaps`, { query: { namespace } });
}

export async function upsertClusterConfigMap(
  id: string,
  name: string,
  body: { set_values: Record<string, string>; remove_keys?: string[] },
  namespace?: string
): Promise<KubernetesConfigMapItem & { action: string }> {
  return request(`/api/kubernetes-clusters/${id}/configmaps/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    query: { namespace },
  });
}

export async function deleteClusterConfigMap(
  id: string,
  name: string,
  namespace?: string
): Promise<void> {
  return request(`/api/kubernetes-clusters/${id}/configmaps/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    query: { namespace },
  });
}

export type KubernetesEnvVar = {
  name: string;
  value?: string | null;
  value_from?: {
    secret_key_ref?: { name: string; key: string; optional?: boolean };
    config_map_key_ref?: { name: string; key: string; optional?: boolean };
  } | null;
};

export type KubernetesEnvFrom = {
  prefix?: string | null;
  secret_ref?: { name: string; optional?: boolean };
  config_map_ref?: { name: string; optional?: boolean };
};

export type KubernetesContainerPort = {
  container_port: number;
  protocol: string;
  name?: string | null;
};

export type KubernetesContainerEnv = {
  name: string;
  image?: string | null;
  ports?: KubernetesContainerPort[];
  env: KubernetesEnvVar[];
  env_from: KubernetesEnvFrom[];
};

export async function fetchDeploymentEnv(
  id: string,
  deployment: string,
  namespace?: string
): Promise<{ name: string; namespace: string; containers: KubernetesContainerEnv[] }> {
  return request(
    `/api/kubernetes-clusters/${id}/deployments/${encodeURIComponent(deployment)}/env`,
    { query: { namespace } }
  );
}

export async function patchDeploymentEnv(
  id: string,
  deployment: string,
  body: { container: string; env: KubernetesEnvVar[]; env_from: KubernetesEnvFrom[] },
  namespace?: string
): Promise<{ name: string; namespace: string; containers: KubernetesContainerEnv[] }> {
  return request(
    `/api/kubernetes-clusters/${id}/deployments/${encodeURIComponent(deployment)}/env`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      query: { namespace },
    }
  );
}
