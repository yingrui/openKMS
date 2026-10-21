/** External HTTP services a Function may call via `client.external("name")`. */
import { request } from './apiClient';

export interface ExternalServiceResponse {
  id: string;
  api_name: string;
  display_name: string;
  description?: string | null;
  base_url: string;
  /** `hmac` signs the body (header `X-OpenKMS-Signature` by default). */
  auth_kind: 'none' | 'bearer' | 'header' | 'hmac';
  auth_header_name?: string | null;
  has_secret: boolean;
  allowed_paths: string[];
  timeout_seconds: number;
  created_at: string;
  updated_at: string;
}

export async function fetchExternalServices(): Promise<ExternalServiceResponse[]> {
  return request<ExternalServiceResponse[]>('/api/ontology/external-services');
}

export async function createExternalService(data: {
  api_name: string;
  display_name: string;
  description?: string;
  base_url: string;
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
    base_url?: string;
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
