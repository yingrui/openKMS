/** API for data sources. */
import { request } from './apiClient';

export interface DataSourceResponse {
  id: string;
  name: string;
  kind: string;
  host: string;
  port: number | null;
  database: string | null;
  username: string;
  password_masked: boolean;
  options: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface DataSourceListResponse {
  items: DataSourceResponse[];
  total: number;
  limit: number;
  offset: number;
}

export async function fetchDataSources(params?: {
  limit?: number;
  offset?: number;
}): Promise<DataSourceListResponse> {
  return request<DataSourceListResponse>('/api/data-sources', {
    query: { limit: params?.limit, offset: params?.offset },
  });
}

export async function fetchAllDataSources(): Promise<DataSourceResponse[]> {
  const merged: DataSourceResponse[] = [];
  let offset = 0;
  const limit = 200;
  let total = 0;
  do {
    const page = await fetchDataSources({ limit, offset });
    merged.push(...page.items);
    total = page.total;
    offset += limit;
  } while (offset < total);
  return merged;
}

export async function fetchDataSource(id: string): Promise<DataSourceResponse> {
  return request<DataSourceResponse>(`/api/data-sources/${id}`);
}

export async function createDataSource(data: {
  name: string;
  kind: string;
  host: string;
  port?: number;
  database?: string;
  username: string;
  password?: string;
  options?: Record<string, unknown>;
}): Promise<DataSourceResponse> {
  return request<DataSourceResponse>('/api/data-sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateDataSource(
  id: string,
  data: {
    name?: string;
    kind?: string;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    options?: Record<string, unknown>;
  }
): Promise<DataSourceResponse> {
  return request<DataSourceResponse>(`/api/data-sources/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteDataSource(id: string): Promise<void> {
  return request<void>(`/api/data-sources/${id}`, { method: 'DELETE' });
}

export async function testDataSourceConnection(id: string): Promise<{ ok: boolean; message: string }> {
  return request<{ ok: boolean; message: string }>(`/api/data-sources/${id}/test`, { method: 'POST' });
}

export async function neo4jDeleteAll(id: string): Promise<{ ok: boolean; message: string }> {
  return request<{ ok: boolean; message: string }>(`/api/data-sources/${id}/neo4j-delete-all`, { method: 'POST' });
}
