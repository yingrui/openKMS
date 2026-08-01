/** API for pipeline configurations (backend). */
import { request } from './apiClient';

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
  try {
    const data = await request<{ variables?: Record<string, string> }>('/api/pipelines/template-variables');
    return data.variables || {};
  } catch {
    return {};
  }
}

export async function fetchPipelines(params?: {
  limit?: number;
  offset?: number;
}): Promise<PipelineListResponse> {
  return request<PipelineListResponse>('/api/pipelines', {
    query: { limit: params?.limit, offset: params?.offset },
  });
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
  return request<PipelineResponse>(`/api/pipelines/${id}`);
}

export async function createPipeline(data: PipelineCreate): Promise<PipelineResponse> {
  return request<PipelineResponse>('/api/pipelines', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updatePipeline(id: string, data: PipelineUpdate): Promise<PipelineResponse> {
  return request<PipelineResponse>(`/api/pipelines/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deletePipeline(id: string): Promise<void> {
  return request<void>(`/api/pipelines/${id}`, { method: 'DELETE' });
}
