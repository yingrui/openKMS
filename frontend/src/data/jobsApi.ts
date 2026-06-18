/** API for processing job runs (backend `/api/jobs`). */
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
  /** Captured worker subprocess output when present (size-capped on the server). */
  worker_log?: string | null;
  worker_log_truncated?: boolean | null;
  worker_log_char_limit?: number | null;
}

export interface JobListResponse {
  items: JobResponse[];
  total: number;
  limit: number;
  offset: number;
}

const KB_INDEX_TASK_NAMES = new Set(['run_kb_index', 'run_kb_wiki_space_index']);
const CONNECTOR_SYNC_TASK_NAMES = new Set(['run_connector_sync']);
const SCHEDULED_AGENT_TASK_NAMES = new Set(['run_scheduled_project_agent']);
const MEDIA_TASK_NAMES = new Set(['run_media_generation', 'generate_media_derivatives']);

/** Primary ID the job runs against (document, knowledge base, connector, or media channel). */
export function jobRunTargetId(job: Pick<JobResponse, 'task_name' | 'args'>): string {
  const args = job.args ?? {};
  if (KB_INDEX_TASK_NAMES.has(job.task_name)) {
    return String(args.knowledge_base_id ?? '');
  }
  if (CONNECTOR_SYNC_TASK_NAMES.has(job.task_name)) {
    return String(args.connector_id ?? '');
  }
  if (MEDIA_TASK_NAMES.has(job.task_name)) {
    return String(args.channel_id ?? args.asset_id ?? '');
  }
  return String(args.document_id ?? '');
}

export function isKbIndexingJob(taskName: string): boolean {
  return KB_INDEX_TASK_NAMES.has(taskName);
}

export function isConnectorSyncJob(taskName: string): boolean {
  return CONNECTOR_SYNC_TASK_NAMES.has(taskName);
}

export function isScheduledAgentJob(taskName: string): boolean {
  return SCHEDULED_AGENT_TASK_NAMES.has(taskName);
}

export function isMediaGenerationJob(taskName: string): boolean {
  return MEDIA_TASK_NAMES.has(taskName);
}

export interface JobCreate {
  document_id: string;
  pipeline_id?: string | null;
  /** When true, always run VLM parse; when false, reuse existing `result.json` on storage if present. */
  force_reparse?: boolean;
}

export async function fetchJobs(params?: {
  document_id?: string;
  knowledge_base_id?: string;
  connector_id?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<JobListResponse> {
  const headers = await getAuthHeaders();
  const query = new URLSearchParams();
  if (params?.document_id) query.set('document_id', params.document_id);
  if (params?.knowledge_base_id) query.set('knowledge_base_id', params.knowledge_base_id);
  if (params?.connector_id) query.set('connector_id', params.connector_id);
  if (params?.status) query.set('status', params.status);
  if (params?.search?.trim()) query.set('search', params.search.trim());
  if (params?.limit != null) query.set('limit', String(params.limit));
  if (params?.offset != null) query.set('offset', String(params.offset));
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await authAwareFetch(`${config.apiUrl}/api/jobs${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch job runs: ${res.status}`);
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

export async function markJobFailed(jobId: number): Promise<JobResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/jobs/${jobId}/mark-failed`, {
    method: 'POST',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to mark job failed');
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
