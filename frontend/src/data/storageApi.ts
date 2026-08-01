/** Console object storage API (metadata + move only). */
import { request } from './apiClient';

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
  return request<StorageBucketInfo>('/api/console/storage');
}

export async function fetchStorageObjects(params: {
  prefix?: string;
  continuation_token?: string | null;
  max_keys?: number;
}): Promise<StorageListResponse> {
  return request<StorageListResponse>('/api/console/storage/objects', {
    query: {
      prefix: params.prefix,
      continuation_token: params.continuation_token,
      max_keys: params.max_keys,
    },
  });
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
  return request<StorageCreateFolderResponse>('/api/console/storage/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function moveStorageObjects(body: StorageMoveRequest): Promise<StorageMoveResponse> {
  return request<StorageMoveResponse>('/api/console/storage/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
