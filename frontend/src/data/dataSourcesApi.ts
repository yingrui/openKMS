/** API for data sources. */
import { config } from '../config';
import { getAuthHeaders } from './apiClient';

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
}

export async function fetchDataSources(): Promise<DataSourceListResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/data-sources`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch data sources: ${res.status}`);
  return res.json();
}

export async function fetchDataSource(id: string): Promise<DataSourceResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/data-sources/${id}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch data source: ${res.status}`);
  return res.json();
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
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/data-sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Failed to create data source');
  }
  return res.json();
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
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/data-sources/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Failed to update data source');
  }
  return res.json();
}

export async function deleteDataSource(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/data-sources/${id}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || 'Failed to delete data source');
  }
}

export async function testDataSourceConnection(id: string): Promise<{ ok: boolean; message: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/data-sources/${id}/test`, {
    method: 'POST',
    headers: { ...headers },
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { detail?: string }).detail || 'Test failed');
  return data as { ok: boolean; message: string };
}
