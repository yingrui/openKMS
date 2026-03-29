import { config } from '../config';
import { getAuthHeaders } from './apiClient';

export interface AuthMeResponse {
  id: string;
  email: string;
  username: string;
  is_admin: boolean;
  /** Realm roles from the IdP JWT (local: admin or empty). */
  roles?: string[];
}

export async function fetchAuthMe(): Promise<AuthMeResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/auth/me`, {
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
