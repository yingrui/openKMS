/** API for pipeline configurations (backend). */
import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';

export interface PipelineResponse {
  id: string;
  name: string;
  description?: string | null;
  command: string;
  default_args?: Record<string, unknown> | null;
  model_id?: string | null;
  model_name?: string | null;
  model_base_url?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PipelineListResponse {
  items: PipelineResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface PipelineCreate {
  name: string;
  description?: string | null;
  command?: string;
  default_args?: Record<string, unknown> | null;
  model_id?: string | null;
  is_active?: boolean;
}

export interface PipelineUpdate {
  name?: string;
  description?: string | null;
  command?: string;
  default_args?: Record<string, unknown> | null;
  model_id?: string | null;
  is_active?: boolean;
}

export async function fetchTemplateVariables(): Promise<Record<string, string>> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/pipelines/template-variables`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) return {};
  const data = await res.json();
  return data.variables || {};
}

export async function fetchPipelines(params?: {
  limit?: number;
  offset?: number;
}): Promise<PipelineListResponse> {
  const query = new URLSearchParams();
  if (params?.limit != null) query.set('limit', String(params.limit));
  if (params?.offset != null) query.set('offset', String(params.offset));
  const qs = query.toString();
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/pipelines${qs ? `?${qs}` : ''}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch pipelines: ${res.status}`);
  return res.json();
}

export async function fetchAllPipelines(): Promise<PipelineResponse[]> {
  const merged: PipelineResponse[] = [];
  let offset = 0;
  const limit = 200;
  let total = 0;
  do {
    const page = await fetchPipelines({ limit, offset });
    merged.push(...page.items);
    total = page.total;
    offset += limit;
  } while (offset < total);
  return merged;
}

export async function fetchPipelineById(id: string): Promise<PipelineResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/pipelines/${id}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch pipeline: ${res.status}`);
  return res.json();
}

export async function createPipeline(data: PipelineCreate): Promise<PipelineResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/pipelines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create pipeline');
  }
  return res.json();
}

export async function updatePipeline(id: string, data: PipelineUpdate): Promise<PipelineResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/pipelines/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update pipeline');
  }
  return res.json();
}

export async function deletePipeline(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/pipelines/${id}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete pipeline');
  }
}
