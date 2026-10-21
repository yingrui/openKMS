/** External HTTP services a Function may call via `client.external("name")`. */
import { request } from './apiClient';

export interface ExternalServiceResponse {
  id: string;
  api_name: string;
  display_name: string;
  description?: string | null;
  /** `http` = a URL the sandbox calls; `k8s_service` = relayed by the backend via the cluster. */
  kind: 'http' | 'k8s_service';
  base_url?: string | null;
  cluster_id?: string | null;
  namespace?: string | null;
  service?: string | null;
  port?: number | null;
  base_path?: string;
  /** `hmac` signs the body (header `X-OpenKMS-Signature` by default). */
  auth_kind: 'none' | 'bearer' | 'header' | 'hmac';
  auth_header_name?: string | null;
  has_secret: boolean;
  allowed_paths: string[];
  timeout_seconds: number;
  /** Functions whose source calls `external("<api_name>")` — what a removal would break. */
  used_by: { id: string; api_name: string; display_name: string }[];
  created_at: string;
  updated_at: string;
}

export interface K8sClusterOption {
  id: string;
  name: string;
  default_namespace: string;
}

export async function fetchExternalServices(): Promise<ExternalServiceResponse[]> {
  return request<ExternalServiceResponse[]>('/api/ontology/external-services');
}

export async function fetchClusterOptions(): Promise<K8sClusterOption[]> {
  return request<K8sClusterOption[]>('/api/ontology/external-services/k8s-clusters');
}

export async function createExternalService(data: {
  api_name: string;
  display_name: string;
  description?: string;
  kind: 'http' | 'k8s_service';
  base_url?: string;
  cluster_id?: string;
  namespace?: string;
  service?: string;
  port?: number;
  base_path?: string;
  auth_kind: string;
  auth_header_name?: string;
  secret?: string;
  allowed_paths: string[];
  timeout_seconds?: number;
}): Promise<ExternalServiceResponse> {
  return request<ExternalServiceResponse>('/api/ontology/external-services', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateExternalService(
  id: string,
  data: {
    display_name?: string;
    description?: string;
    kind?: 'http' | 'k8s_service';
    base_url?: string;
    cluster_id?: string;
    namespace?: string;
    service?: string;
    port?: number;
    base_path?: string;
    auth_kind?: string;
    auth_header_name?: string;
    /** Omit to keep the stored secret; send '' to clear it. */
    secret?: string;
    allowed_paths?: string[];
    timeout_seconds?: number;
  }
): Promise<ExternalServiceResponse> {
  return request<ExternalServiceResponse>(`/api/ontology/external-services/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteExternalService(id: string): Promise<void> {
  await request<void>(`/api/ontology/external-services/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
