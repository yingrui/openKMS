/** API for service providers (OpenAI, Anthropic, etc.). */
import { request } from './apiClient';

/**
 * What to send when asking this provider to think, or not to.
 *
 * Data rather than a choice from a list, because every vendor spells it differently — DeepSeek
 * `{"thinking": {"type": "disabled"}}`, DashScope `{"enable_thinking": false}`, OpenAI `reasoning_effort`, Anthropic
 * a token budget. A missing fragment means the vendor cannot be asked, so nothing is sent.
 */
export interface ProviderThinking {
  on?: Record<string, unknown>;
  off?: Record<string, unknown>;
}

export interface ApiProviderResponse {
  id: string;
  name: string;
  base_url: string;
  api_key_set: boolean;
  config?: Record<string, unknown> | null;
  thinking?: ProviderThinking | null;
  created_at: string;
  updated_at: string;
}

export interface ApiProviderListResponse {
  items: ApiProviderResponse[];
  total: number;
}

export interface ApiProviderCreate {
  name: string;
  base_url: string;
  api_key?: string | null;
  config?: Record<string, unknown> | null;
  thinking?: ProviderThinking | null;
}

export interface ApiProviderUpdate {
  name?: string;
  base_url?: string;
  api_key?: string | null;
  config?: Record<string, unknown> | null;
  thinking?: ProviderThinking | null;
}

export async function fetchProviders(): Promise<ApiProviderListResponse> {
  return request<ApiProviderListResponse>('/api/providers');
}

export async function fetchProviderById(id: string): Promise<ApiProviderResponse> {
  return request<ApiProviderResponse>(`/api/providers/${id}`);
}

export async function createProvider(data: ApiProviderCreate): Promise<ApiProviderResponse> {
  return request<ApiProviderResponse>('/api/providers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateProvider(id: string, data: ApiProviderUpdate): Promise<ApiProviderResponse> {
  return request<ApiProviderResponse>(`/api/providers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteProvider(id: string): Promise<void> {
  return request<void>(`/api/providers/${id}`, { method: 'DELETE' });
}
