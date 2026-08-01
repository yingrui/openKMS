import { request } from './apiClient';

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
  return request<AuthMeResponse>('/api/auth/me');
}

export async function patchAuthUiLocale(ui_locale: 'en' | 'zh-CN'): Promise<AuthMeResponse> {
  return request<AuthMeResponse>('/api/auth/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ui_locale }),
  });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return request<void>('/api/auth/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}
