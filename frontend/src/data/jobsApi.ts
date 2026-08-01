/** API for processing job runs (backend `/api/jobs`). */
import { request } from './apiClient';

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
  return request<JobListResponse>('/api/jobs', {
    query: {
      document_id: params?.document_id,
      knowledge_base_id: params?.knowledge_base_id,
      connector_id: params?.connector_id,
      status: params?.status,
      search: params?.search?.trim(),
      limit: params?.limit,
      offset: params?.offset,
    },
  });
}

export async function fetchJobById(jobId: number): Promise<JobResponse> {
  return request<JobResponse>(`/api/jobs/${jobId}`);
}

export async function createJob(data: JobCreate): Promise<JobResponse> {
  return request<JobResponse>('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function markJobFailed(jobId: number): Promise<JobResponse> {
  return request<JobResponse>(`/api/jobs/${jobId}/mark-failed`, { method: 'POST' });
}

export async function retryJob(jobId: number): Promise<JobResponse> {
  return request<JobResponse>(`/api/jobs/${jobId}/retry`, { method: 'POST' });
}

export async function deleteJob(jobId: number): Promise<void> {
  return request<void>(`/api/jobs/${jobId}`, { method: 'DELETE' });
}
