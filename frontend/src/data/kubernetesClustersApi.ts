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
