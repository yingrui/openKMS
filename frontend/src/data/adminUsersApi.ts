import { request } from './apiClient';

export interface AdminUserRow {
  id: string;
  email: string;
  username: string;
  name?: string | null;
  is_admin?: boolean | null;
  created_at?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
}

/** Local-mode user row (admin flag always set). */
export type LocalUserRow = AdminUserRow & { is_admin: boolean; created_at: string | null };

export interface AdminUsersPage {
  auth_mode: string;
  managed_in_console: boolean;
  idp_notice: string | null;
  users: AdminUserRow[];
}

export async function fetchAdminUsersPage(): Promise<AdminUsersPage> {
  return request<AdminUsersPage>('/api/admin/users');
}

export async function patchLocalUser(userId: string, is_admin: boolean): Promise<LocalUserRow> {
  return request<LocalUserRow>(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_admin }),
  });
}

export async function deleteLocalUser(userId: string): Promise<void> {
  return request<void>(`/api/admin/users/${userId}`, { method: 'DELETE' });
}

export async function createLocalUser(body: {
  email: string;
  username: string;
  password: string;
  is_admin: boolean;
}): Promise<LocalUserRow> {
  return request<LocalUserRow>('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
