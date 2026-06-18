/** Console object storage API (metadata + move only). */
import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';

export interface StorageBucketInfo {
  bucket: string;
  storage_enabled: boolean;
}

export interface StorageFolderItem {
  prefix: string;
}

export interface StorageObjectItem {
  key: string;
  size: number;
  last_modified: string | null;
}

export interface StorageListResponse {
  prefix: string;
  folders: StorageFolderItem[];
  objects: StorageObjectItem[];
  next_continuation_token: string | null;
  truncated: boolean;
}

export type StorageMoveItem = {
  type: 'prefix' | 'object';
  key: string;
};

export interface StorageMoveRequest {
  items: StorageMoveItem[];
  destination_prefix: string;
  delete_source?: boolean;
}

export interface StorageMoveResponse {
  moved_count: number;
  skipped_count: number;
  errors: string[];
}

export async function fetchStorageInfo(): Promise<StorageBucketInfo> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/console/storage`, {
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to load storage info');
  return res.json();
}

export async function fetchStorageObjects(params: {
  prefix?: string;
  continuation_token?: string | null;
  max_keys?: number;
}): Promise<StorageListResponse> {
  const query = new URLSearchParams();
  if (params.prefix) query.set('prefix', params.prefix);
  if (params.continuation_token) query.set('continuation_token', params.continuation_token);
  if (params.max_keys != null) query.set('max_keys', String(params.max_keys));
  const qs = query.toString();
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/console/storage/objects${qs ? `?${qs}` : ''}`,
    { headers, credentials: 'include' },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to list storage objects');
  }
  return res.json();
}

export interface StorageCreateFolderRequest {
  parent_prefix?: string;
  name: string;
}

export interface StorageCreateFolderResponse {
  prefix: string;
}

export async function createStorageFolder(
  body: StorageCreateFolderRequest,
): Promise<StorageCreateFolderResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/console/storage/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create folder');
  }
  return res.json();
}

export async function moveStorageObjects(body: StorageMoveRequest): Promise<StorageMoveResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/console/storage/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Move failed');
  }
  return res.json();
}
