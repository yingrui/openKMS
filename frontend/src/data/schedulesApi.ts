import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';

export type ScheduleMode = 'stateless' | 'stateful';
export type OnRunCompleted = 'keep' | 'delete';

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
  project_id: string | null;
  conversation_id: string | null;
  mode: ScheduleMode | null;
}

export interface ScheduleListResponse {
  items: Schedule[];
  total: number;
  limit: number;
  offset: number;
}

export interface ProjectAgentSchedule extends Schedule {
  mode: ScheduleMode;
  project_id: string;
  prompt: string;
  plan_mode: boolean;
  on_run_completed: OnRunCompleted;
}

export interface ProjectAgentScheduleCreate {
  display_name: string;
  mode: ScheduleMode;
  cron: string;
  timezone?: string;
  prompt: string;
  enabled?: boolean;
  on_run_completed?: OnRunCompleted;
  conversation_id?: string | null;
}

export interface ProjectAgentSchedulePatch {
  display_name?: string;
  cron?: string | null;
  timezone?: string;
  prompt?: string;
  enabled?: boolean;
  on_run_completed?: OnRunCompleted;
}

async function parseError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (typeof j.detail === 'string') return j.detail;
  } catch {
    /* ignore */
  }
  return res.statusText;
}

export async function fetchSchedules(params?: {
  limit?: number;
  offset?: number;
}): Promise<ScheduleListResponse> {
  const headers = await getAuthHeaders();
  const q = new URLSearchParams();
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  const qs = q.toString();
  const res = await authAwareFetch(`${config.apiUrl}/api/schedules${qs ? `?${qs}` : ''}`, {
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
  body: { enabled?: boolean; cron?: string | null; timezone?: string; prompt?: string },
): Promise<Schedule> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/schedules/${id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
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
    throw new Error(await parseError(res));
  }
  return res.json();
}

export async function listProjectSchedules(projectId: string): Promise<ProjectAgentSchedule[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/projects/${projectId}/schedules`, {
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createProjectSchedule(
  projectId: string,
  body: ProjectAgentScheduleCreate,
): Promise<ProjectAgentSchedule> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/projects/${projectId}/schedules`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function patchProjectSchedule(
  projectId: string,
  scheduleId: string,
  body: ProjectAgentSchedulePatch,
): Promise<ProjectAgentSchedule> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/projects/${projectId}/schedules/${scheduleId}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteProjectSchedule(projectId: string, scheduleId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/projects/${projectId}/schedules/${scheduleId}`,
    {
      method: 'DELETE',
      headers,
      credentials: 'include',
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
}

export async function runProjectScheduleNow(
  projectId: string,
  scheduleId: string,
): Promise<{ job_id: number }> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/projects/${projectId}/schedules/${scheduleId}/run-now`,
    {
      method: 'POST',
      headers,
      credentials: 'include',
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export function scheduleKindLabel(kind: string, t: (key: string) => string): string {
  if (kind === 'connector_sync') return t('schedules.kindConnectorSync');
  if (kind === 'project_agent_stateless') return t('schedules.kindAgentStateless');
  if (kind === 'project_agent_stateful') return t('schedules.kindAgentStateful');
  return kind;
}
