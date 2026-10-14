/** API for semantic-model fields (model-scoped: column ref / expression + role). */
import { request } from './apiClient';

export interface SemanticModelFieldResponse {
  id: string;
  semantic_model_id: string;
  dataset_id: string;
  name: string;
  column_name: string | null;
  expression: { dialects?: Record<string, string> } | null;
  datatype: string | null;
  dimension: { is_time?: boolean } | null;
  ai_context: Record<string, unknown> | null;
  ordinal: number;
  created_at: string;
  updated_at: string;
}

export interface SemanticModelFieldListResponse {
  items: SemanticModelFieldResponse[];
  total: number;
}

export interface SemanticModelFieldPayload {
  dataset_id: string;
  name: string;
  column_name: string | null;
  expression: { dialects?: Record<string, string> } | null;
  datatype: string | null;
  dimension: { is_time: boolean } | null;
  ai_context: Record<string, unknown> | null;
}

export async function fetchModelFields(modelId: string): Promise<SemanticModelFieldListResponse> {
  return request<SemanticModelFieldListResponse>(`/api/semantic-models/${modelId}/fields`);
}

export async function createModelField(
  modelId: string,
  data: SemanticModelFieldPayload,
): Promise<SemanticModelFieldResponse> {
  return request<SemanticModelFieldResponse>(`/api/semantic-models/${modelId}/fields`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateModelField(
  modelId: string,
  fieldId: string,
  data: Partial<SemanticModelFieldPayload>,
): Promise<SemanticModelFieldResponse> {
  return request<SemanticModelFieldResponse>(`/api/semantic-models/${modelId}/fields/${fieldId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteModelField(modelId: string, fieldId: string): Promise<void> {
  return request<void>(`/api/semantic-models/${modelId}/fields/${fieldId}`, { method: 'DELETE' });
}

/** The ANSI_SQL fragment of a field expression, for display. */
export function fieldExpressionSql(field: SemanticModelFieldResponse): string {
  return field.expression?.dialects?.ANSI_SQL ?? field.column_name ?? '';
}
