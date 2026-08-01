import { request } from './apiClient';

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
  return request<SystemPublicResponse>('/api/public/system');
}

export async function fetchSystemSettings(): Promise<SystemSettingsResponse> {
  return request<SystemSettingsResponse>('/api/system/settings');
}

export async function updateSystemSettings(body: SystemSettingsUpdate): Promise<SystemSettingsResponse> {
  return request<SystemSettingsResponse>('/api/system/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
