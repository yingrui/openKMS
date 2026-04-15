import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';

export interface LocalUserRow {
  id: string;
  email: string;
  username: string;
  is_admin: boolean;
  created_at: string | null;
}

export interface AdminUsersPage {
  auth_mode: string;
  managed_in_console: boolean;
  idp_notice: string | null;
  users: LocalUserRow[];
}

export async function fetchAdminUsersPage(): Promise<AdminUsersPage> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/users`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  return res.json();
}

export async function patchLocalUser(userId: string, is_admin: boolean): Promise<LocalUserRow> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ is_admin }),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      if (typeof j.detail === 'string') msg = j.detail;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function deleteLocalUser(userId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      if (typeof j.detail === 'string') msg = j.detail;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

export async function createLocalUser(body: {
  email: string;
  username: string;
  password: string;
  is_admin: boolean;
}): Promise<LocalUserRow> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/users`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      if (typeof j.detail === 'string') msg = j.detail;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}
