/** API for service providers (OpenAI, Anthropic, etc.). */
import { config } from '../config';
import { getAuthHeaders } from './apiClient';

export interface ApiProviderResponse {
  id: string;
  name: string;
  base_url: string;
  api_key_set: boolean;
  config?: Record<string, unknown> | null;
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
}

export interface ApiProviderUpdate {
  name?: string;
  base_url?: string;
  api_key?: string | null;
  config?: Record<string, unknown> | null;
}

export async function fetchProviders(): Promise<ApiProviderListResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/providers`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch providers: ${res.status}`);
  return res.json();
}

export async function fetchProviderById(id: string): Promise<ApiProviderResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/providers/${id}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch provider: ${res.status}`);
  return res.json();
}

export async function createProvider(data: ApiProviderCreate): Promise<ApiProviderResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create provider');
  }
  return res.json();
}

export async function updateProvider(id: string, data: ApiProviderUpdate): Promise<ApiProviderResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/providers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update provider');
  }
  return res.json();
}

export async function deleteProvider(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/providers/${id}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete provider');
  }
}
