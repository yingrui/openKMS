import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';

export interface Schedule {
  id: string;
  kind: string;
  target_id: string;
  display_name: string;
  cron: string | null;
  timezone: string;
  enabled: boolean;
  next_run_at: string | null;
  last_fired_slot: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_job_id: number | null;
  connector_id: string | null;
}

export interface ScheduleListResponse {
  items: Schedule[];
  total: number;
}

export async function fetchSchedules(): Promise<ScheduleListResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/schedules`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch schedules: ${res.status}`);
  }
  return res.json();
}

export async function patchSchedule(
  id: string,
  body: { enabled?: boolean; cron?: string | null; timezone?: string }
): Promise<Schedule> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/schedules/${id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to update schedule: ${res.status}`);
  }
  return res.json();
}

export async function runScheduleNow(id: string): Promise<{ job_id: number }> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/schedules/${id}/run-now`, {
    method: 'POST',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to queue schedule: ${res.status}`);
  }
  return res.json();
}
