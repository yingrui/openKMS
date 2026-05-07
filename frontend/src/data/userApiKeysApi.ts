import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';

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

async function parseError(res: Response): Promise<string> {
  const err = await res.json().catch(() => ({}));
  return typeof err.detail === 'string' ? err.detail : `Request failed (${res.status})`;
}

export async function fetchApiKeys(includeRevoked = false): Promise<ApiKeyListItem[]> {
  const headers = await getAuthHeaders();
  const q = includeRevoked ? '?include_revoked=true' : '';
  const res = await authAwareFetch(`${config.apiUrl}/api/auth/api-keys${q}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<ApiKeyListItem[]>;
}

export async function createApiKey(name: string): Promise<ApiKeyCreated> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/auth/api-keys`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name: name.trim() }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<ApiKeyCreated>;
}

export async function revokeApiKey(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/auth/api-keys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
}
