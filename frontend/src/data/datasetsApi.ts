/** API for datasets. */
import { request } from './apiClient';

export interface DatasetResponse {
  id: string;
  data_source_id: string;
  data_source_name: string | null;
  schema_name: string;
  table_name: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface DatasetListResponse {
  items: DatasetResponse[];
  total: number;
}

export interface TableInfo {
  schema_name: string;
  table_name: string;
}

export async function fetchDatasets(params?: { data_source_id?: string }): Promise<DatasetListResponse> {
  return request<DatasetListResponse>('/api/datasets', {
    query: { data_source_id: params?.data_source_id },
  });
}

export async function fetchTablesFromSource(dataSourceId: string): Promise<TableInfo[]> {
  return request<TableInfo[]>(`/api/datasets/from-source/${dataSourceId}`);
}

export async function createDataset(data: {
  data_source_id: string;
  schema_name: string;
  table_name: string;
  display_name?: string;
}): Promise<DatasetResponse> {
  return request<DatasetResponse>('/api/datasets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateDataset(
  id: string,
  data: { schema_name?: string; table_name?: string; display_name?: string | null }
): Promise<DatasetResponse> {
  return request<DatasetResponse>(`/api/datasets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function fetchDataset(id: string): Promise<DatasetResponse> {
  return request<DatasetResponse>(`/api/datasets/${id}`);
}

export interface ColumnMetadata {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  ordinal_position: number;
}

export interface DatasetRowsResponse {
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
}

export async function fetchDatasetRows(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<DatasetRowsResponse> {
  return request<DatasetRowsResponse>(`/api/datasets/${id}/rows`, {
    query: { limit: params?.limit, offset: params?.offset },
  });
}

export async function fetchDatasetMetadata(id: string): Promise<ColumnMetadata[]> {
  return request<ColumnMetadata[]>(`/api/datasets/${id}/metadata`);
}

export async function deleteDataset(id: string): Promise<void> {
  return request<void>(`/api/datasets/${id}`, { method: 'DELETE' });
}
