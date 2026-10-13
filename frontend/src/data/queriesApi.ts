/** API for model-level saved queries (Ossie saved_queries). */
import { request } from './apiClient';

export interface QueryMetric {
  name: string;
  metric_id: string;
}

export interface QueryFilter {
  column: string;
  op: string;
  value?: unknown;
}

export interface SavedQueryResponse {
  id: string;
  base_dataset_id: string;
  base_dataset_name: string | null;
  name: string;
  description: string | null;
  metrics: QueryMetric[];
  group_by: string[];
  joins: string[];
  filters: QueryFilter[] | null;
  exports: string[];
  ai_context: Record<string, unknown> | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface SavedQueryListResponse {
  items: SavedQueryResponse[];
  total: number;
}

export interface SavedQueryRunResponse {
  query_id: string;
  columns: string[];
  rows: Record<string, unknown>[];
  duration_ms: number;
}

export interface SavedQueryPayload {
  name: string;
  semantic_model_id: string;
  base_dataset_id: string;
  description?: string | null;
  metrics: QueryMetric[];
  group_by: string[];
  joins: string[];
  filters?: QueryFilter[] | null;
}

export async function fetchSavedQueries(semanticModelId?: string): Promise<SavedQueryListResponse> {
  return request<SavedQueryListResponse>('/api/queries', {
    query: semanticModelId ? { semantic_model_id: semanticModelId } : undefined,
  });
}

export async function createSavedQuery(data: SavedQueryPayload): Promise<SavedQueryResponse> {
  return request<SavedQueryResponse>('/api/queries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateSavedQuery(
  id: string,
  data: Partial<SavedQueryPayload>,
): Promise<SavedQueryResponse> {
  return request<SavedQueryResponse>(`/api/queries/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteSavedQuery(id: string): Promise<void> {
  return request<void>(`/api/queries/${id}`, { method: 'DELETE' });
}

export async function runSavedQuery(id: string): Promise<SavedQueryRunResponse> {
  return request<SavedQueryRunResponse>(`/api/queries/${id}/run`);
}
