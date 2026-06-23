import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';

export interface AuthMeResponse {
  id: string;
  email: string;
  username: string;
  is_admin: boolean;
  /** Realm roles from the IdP JWT (local: admin or empty). */
  roles?: string[];
  /** Saved in DB when set under Settings (en / zh-CN). */
  ui_locale?: string | null;
}

export async function fetchAuthMe(): Promise<AuthMeResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/auth/me`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = typeof err.detail === 'string' ? err.detail : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json() as Promise<AuthMeResponse>;
}

export async function patchAuthUiLocale(ui_locale: 'en' | 'zh-CN'): Promise<AuthMeResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/auth/me`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ui_locale }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = typeof err.detail === 'string' ? err.detail : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json() as Promise<AuthMeResponse>;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/auth/me`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = typeof err.detail === 'string' ? err.detail : `Request failed (${res.status})`;
    throw new Error(msg);
  }
}
