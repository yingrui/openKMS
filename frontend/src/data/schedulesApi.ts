import { request } from './apiClient';

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
  last_conversation_id: string | null;
  mode: ScheduleMode | null;
}

/** Session to open for viewing scheduled agent output (stateful bound session or last successful run). */
export function scheduleSessionId(row: Pick<Schedule, 'mode' | 'conversation_id' | 'last_conversation_id'>): string | null {
  if (row.mode === 'stateful' && row.conversation_id) return row.conversation_id;
  return row.last_conversation_id ?? null;
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

export async function fetchSchedules(params?: {
  limit?: number;
  offset?: number;
}): Promise<ScheduleListResponse> {
  return request<ScheduleListResponse>('/api/schedules', {
    query: { limit: params?.limit, offset: params?.offset },
  });
}

export async function patchSchedule(
  id: string,
  body: { enabled?: boolean; cron?: string | null; timezone?: string; prompt?: string },
): Promise<Schedule> {
  return request<Schedule>(`/api/schedules/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function runScheduleNow(id: string): Promise<{ job_id: number }> {
  return request<{ job_id: number }>(`/api/schedules/${id}/run-now`, { method: 'POST' });
}

export async function listProjectSchedules(projectId: string): Promise<ProjectAgentSchedule[]> {
  return request<ProjectAgentSchedule[]>(`/api/projects/${projectId}/schedules`);
}

export async function createProjectSchedule(
  projectId: string,
  body: ProjectAgentScheduleCreate,
): Promise<ProjectAgentSchedule> {
  return request<ProjectAgentSchedule>(`/api/projects/${projectId}/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function patchProjectSchedule(
  projectId: string,
  scheduleId: string,
  body: ProjectAgentSchedulePatch,
): Promise<ProjectAgentSchedule> {
  return request<ProjectAgentSchedule>(`/api/projects/${projectId}/schedules/${scheduleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteProjectSchedule(projectId: string, scheduleId: string): Promise<void> {
  return request<void>(`/api/projects/${projectId}/schedules/${scheduleId}`, { method: 'DELETE' });
}

export async function runProjectScheduleNow(
  projectId: string,
  scheduleId: string,
): Promise<{ job_id: number }> {
  return request<{ job_id: number }>(`/api/projects/${projectId}/schedules/${scheduleId}/run-now`, {
    method: 'POST',
  });
}

export function scheduleKindLabel(kind: string, t: (key: string) => string): string {
  if (kind === 'connector_sync') return t('schedules.kindConnectorSync');
  if (kind === 'project_agent_stateless') return t('schedules.kindAgentStateless');
  if (kind === 'project_agent_stateful') return t('schedules.kindAgentStateful');
  return kind;
}
