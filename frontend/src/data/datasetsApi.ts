/** API for datasets. */
import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';

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
  const headers = await getAuthHeaders();
  const qs = params?.data_source_id
    ? `?data_source_id=${encodeURIComponent(params.data_source_id)}`
    : '';
  const res = await authAwareFetch(`${config.apiUrl}/api/datasets${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch datasets: ${res.status}`);
  return res.json();
}

export async function fetchTablesFromSource(dataSourceId: string): Promise<TableInfo[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/datasets/from-source/${dataSourceId}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to list tables: ${res.status}`);
  return res.json();
}

export async function createDataset(data: {
  data_source_id: string;
  schema_name: string;
  table_name: string;
  display_name?: string;
}): Promise<DatasetResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/datasets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Failed to create dataset');
  }
  return res.json();
}

export async function updateDataset(
  id: string,
  data: { schema_name?: string; table_name?: string; display_name?: string }
): Promise<DatasetResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/datasets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Failed to update dataset');
  }
  return res.json();
}

export async function fetchDataset(id: string): Promise<DatasetResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/datasets/${id}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error('Dataset not found');
    throw new Error(`Failed to fetch dataset: ${res.status}`);
  }
  return res.json();
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
  const headers = await getAuthHeaders();
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.offset != null) qs.set('offset', String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : '';
  const res = await authAwareFetch(`${config.apiUrl}/api/datasets/${id}/rows${suffix}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `Failed to fetch rows: ${res.status}`);
  }
  return res.json();
}

export async function fetchDatasetMetadata(id: string): Promise<ColumnMetadata[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/datasets/${id}/metadata`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `Failed to fetch metadata: ${res.status}`);
  }
  return res.json();
}

export async function deleteDataset(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/datasets/${id}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Failed to delete dataset');
  }
}
