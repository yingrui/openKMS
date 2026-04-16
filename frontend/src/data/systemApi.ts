import { config } from '../config';
import { authAwareFetch, getAuthHeaders } from './apiClient';

/** Shown in the sidebar and public API when `system_settings.system_name` is empty or whitespace. */
export const DEFAULT_SYSTEM_DISPLAY_NAME = 'openKMS';

export function effectiveSystemDisplayName(system_name: string | null | undefined): string {
  const t = (system_name ?? '').trim();
  return t || DEFAULT_SYSTEM_DISPLAY_NAME;
}

export type SystemPublicResponse = {
  system_name: string;
};

export type SystemSettingsResponse = {
  system_name: string;
  default_timezone: string;
  api_base_url_note: string | null;
};

export type SystemSettingsUpdate = {
  system_name: string;
  default_timezone: string;
  api_base_url_note: string | null;
};

export async function fetchSystemPublic(): Promise<SystemPublicResponse> {
  const res = await authAwareFetch(`${config.apiUrl}/api/public/system`);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Failed to load public system info (${res.status})`);
  }
  return res.json() as Promise<SystemPublicResponse>;
}

export async function fetchSystemSettings(): Promise<SystemSettingsResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/system/settings`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Failed to load system settings (${res.status})`);
  }
  return res.json() as Promise<SystemSettingsResponse>;
}

export async function updateSystemSettings(body: SystemSettingsUpdate): Promise<SystemSettingsResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/system/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Failed to save system settings (${res.status})`);
  }
  return res.json() as Promise<SystemSettingsResponse>;
}
