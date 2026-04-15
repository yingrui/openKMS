/** API for processing jobs (backend). */
import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';

export interface JobEvent {
  type: string;
  at?: string | null;
}

export interface JobResponse {
  id: number;
  queue_name: string;
  task_name: string;
  status: string;
  args: Record<string, unknown>;
  scheduled_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  attempts: number;
  created_at?: string | null;
  events?: JobEvent[];
}

export interface JobListResponse {
  items: JobResponse[];
  total: number;
}

export interface JobCreate {
  document_id: string;
  pipeline_id?: string | null;
}

export async function fetchJobs(params?: {
  document_id?: string;
  limit?: number;
  offset?: number;
}): Promise<JobListResponse> {
  const headers = await getAuthHeaders();
  const query = new URLSearchParams();
  if (params?.document_id) query.set('document_id', params.document_id);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await authAwareFetch(`${config.apiUrl}/api/jobs${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch jobs: ${res.status}`);
  return res.json();
}

export async function fetchJobById(jobId: number): Promise<JobResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/jobs/${jobId}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch job: ${res.status}`);
  return res.json();
}

export async function createJob(data: JobCreate): Promise<JobResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create job');
  }
  return res.json();
}

export async function retryJob(jobId: number): Promise<JobResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/jobs/${jobId}/retry`, {
    method: 'POST',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to retry job');
  }
  return res.json();
}

export async function deleteJob(jobId: number): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/jobs/${jobId}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete job');
  }
}
