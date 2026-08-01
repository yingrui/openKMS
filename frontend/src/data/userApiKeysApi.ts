import { request } from './apiClient';

export interface ApiKeyListItem {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface ApiKeyCreated {
  id: string;
  name: string;
  key_prefix: string;
  token: string;
  created_at: string | null;
}

export async function fetchApiKeys(includeRevoked = false): Promise<ApiKeyListItem[]> {
  return request<ApiKeyListItem[]>('/api/auth/api-keys', {
    query: { include_revoked: includeRevoked ? true : undefined },
  });
}

export async function createApiKey(name: string): Promise<ApiKeyCreated> {
  return request<ApiKeyCreated>('/api/auth/api-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() }),
  });
}

export async function revokeApiKey(id: string): Promise<void> {
  return request<void>(`/api/auth/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
