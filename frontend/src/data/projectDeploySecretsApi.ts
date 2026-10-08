/** Project deploy secrets (values write-only; never returned). */
import { request } from './apiClient';

export interface ProjectDeploySecretResponse {
  id: string;
  project_id: string;
  name: string;
  cluster_id: string | null;
  namespace: string;
  key_names: string[];
  last_synced_at: string | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export async function listProjectDeploySecrets(
  projectId: string
): Promise<ProjectDeploySecretResponse[]> {
  return request<ProjectDeploySecretResponse[]>(`/api/projects/${projectId}/deploy-secrets`);
}

export async function createProjectDeploySecret(
  projectId: string,
  body: {
    name: string;
    cluster_id: string;
    namespace?: string;
    values: Record<string, string>;
  }
): Promise<ProjectDeploySecretResponse> {
  return request<ProjectDeploySecretResponse>(`/api/projects/${projectId}/deploy-secrets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function updateProjectDeploySecret(
  projectId: string,
  secretId: string,
  body: {
    cluster_id?: string;
    namespace?: string;
    set_values?: Record<string, string>;
    remove_keys?: string[];
  }
): Promise<ProjectDeploySecretResponse> {
  return request<ProjectDeploySecretResponse>(
    `/api/projects/${projectId}/deploy-secrets/${secretId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

export async function deleteProjectDeploySecret(
  projectId: string,
  secretId: string,
  deleteInCluster = false
): Promise<void> {
  return request<void>(`/api/projects/${projectId}/deploy-secrets/${secretId}`, {
    method: 'DELETE',
    query: { delete_in_cluster: deleteInCluster ? 'true' : undefined },
  });
}

export async function syncProjectDeploySecret(
  projectId: string,
  secretId: string
): Promise<ProjectDeploySecretResponse> {
  return request<ProjectDeploySecretResponse>(
    `/api/projects/${projectId}/deploy-secrets/${secretId}/sync`,
    { method: 'POST' }
  );
}
