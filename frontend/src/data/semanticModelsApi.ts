/** API for semantic models (named scopes over the shared data layer). */
import { request, requestText } from './apiClient';

export interface SemanticModelDatasetRef {
  id: string;
  name: string;
}

export interface SemanticModelResponse {
  id: string;
  name: string;
  description: string | null;
  dataset_ids: string[];
  datasets: SemanticModelDatasetRef[];
  ai_context: Record<string, unknown> | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface SemanticModelListResponse {
  items: SemanticModelResponse[];
  total: number;
}

export interface SemanticModelPayload {
  name: string;
  description?: string | null;
  dataset_ids: string[];
  ai_context?: Record<string, unknown> | null;
}

export interface SemanticModelImportSummary {
  semantic_model_id: string;
  relationships: number;
  metrics: number;
  fields: number;
  columns: number;
  warnings: string[];
}

export async function fetchSemanticModels(): Promise<SemanticModelListResponse> {
  return request<SemanticModelListResponse>('/api/semantic-models');
}

export async function fetchSemanticModel(id: string): Promise<SemanticModelResponse> {
  return request<SemanticModelResponse>(`/api/semantic-models/${id}`);
}

export async function createSemanticModel(data: SemanticModelPayload): Promise<SemanticModelResponse> {
  return request<SemanticModelResponse>('/api/semantic-models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateSemanticModel(
  id: string,
  data: Partial<SemanticModelPayload>,
): Promise<SemanticModelResponse> {
  return request<SemanticModelResponse>(`/api/semantic-models/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteSemanticModel(id: string): Promise<void> {
  return request<void>(`/api/semantic-models/${id}`, { method: 'DELETE' });
}

export async function exportSemanticModel(id: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/api/semantic-models/${id}/export`);
}

export async function exportSemanticModelYaml(id: string): Promise<string> {
  return requestText(`/api/semantic-models/${id}/export?format=yaml`);
}

export async function importSemanticModel(doc: unknown): Promise<SemanticModelImportSummary> {
  return request<SemanticModelImportSummary>('/api/semantic-models/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  });
}
