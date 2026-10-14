/** API for semantic-model fields (model-scoped: column ref / expression + role). */
import { request } from './apiClient';

export interface SemanticModelFieldDialect {
  dialect: string;
  expression: string;
}

export interface SemanticModelFieldDimension {
  is_time?: boolean;
}

export interface SemanticModelFieldResponse {
  id: string;
  semantic_model_id: string;
  dataset_id: string;
  name: string;
  column_name: string | null;
  expression: { dialects?: SemanticModelFieldDialect[] } | null;
  datatype: string | null;
  description: string | null;
  dimension: SemanticModelFieldDimension | null;
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
  expression: { dialects?: SemanticModelFieldDialect[] } | null;
  datatype: string | null;
  description: string | null;
  dimension: SemanticModelFieldDimension | null;
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
  const d = field.expression?.dialects;
  if (Array.isArray(d)) return d.find((x) => x.dialect === 'ANSI_SQL')?.expression ?? field.column_name ?? '';
  return field.column_name ?? '';
}
