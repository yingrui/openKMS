/** API for dataset fields (the Ossie semantic field layer). */
import { request } from './apiClient';

export interface DatasetFieldExpression {
  dialects?: Record<string, string>;
}

export interface DatasetFieldResponse {
  id: string;
  dataset_id: string;
  name: string;
  column_name: string | null;
  expression: DatasetFieldExpression | null;
  datatype: string | null;
  dimension: { is_time?: boolean } | null;
  ai_context: Record<string, unknown> | null;
  ordinal: number;
  created_at: string;
  updated_at: string;
}

export interface DatasetFieldListResponse {
  items: DatasetFieldResponse[];
  total: number;
}

export interface DatasetFieldPayload {
  name: string;
  column_name: string | null;
  expression: DatasetFieldExpression | null;
  datatype: string | null;
  dimension: { is_time: boolean } | null;
  ai_context: Record<string, unknown> | null;
}

export async function fetchDatasetFields(datasetId: string): Promise<DatasetFieldListResponse> {
  return request<DatasetFieldListResponse>(`/api/datasets/${datasetId}/fields`);
}

export async function syncDatasetFields(datasetId: string): Promise<{ added: number }> {
  return request<{ added: number }>(`/api/datasets/${datasetId}/fields/sync`, {
    method: 'POST',
  });
}

export async function createDatasetField(
  datasetId: string,
  data: DatasetFieldPayload,
): Promise<DatasetFieldResponse> {
  return request<DatasetFieldResponse>(`/api/datasets/${datasetId}/fields`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateDatasetField(
  datasetId: string,
  fieldId: string,
  data: Partial<DatasetFieldPayload>,
): Promise<DatasetFieldResponse> {
  return request<DatasetFieldResponse>(`/api/datasets/${datasetId}/fields/${fieldId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteDatasetField(datasetId: string, fieldId: string): Promise<void> {
  return request<void>(`/api/datasets/${datasetId}/fields/${fieldId}`, { method: 'DELETE' });
}

/** The ANSI_SQL fragment of a field expression, for display. */
export function fieldExpressionSql(field: DatasetFieldResponse): string {
  return field.expression?.dialects?.ANSI_SQL ?? field.column_name ?? '';
}
