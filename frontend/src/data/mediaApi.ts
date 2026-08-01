/** API for media assets. */
import { request } from './apiClient';

export type MediaKind = 'image' | 'video';

export interface MediaAssetOut {
  id: string;
  channel_id: string;
  media_kind: MediaKind;
  title: string;
  description?: string | null;
  captured_at?: string | null;
  location?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  storage_key: string;
  thumbnail_key?: string | null;
  poster_key?: string | null;
  content_type?: string | null;
  width?: number | null;
  height?: number | null;
  duration_ms?: number | null;
  provenance: 'uploaded' | 'generated';
  generation?: Record<string, unknown> | null;
  series_id: string;
  lifecycle_status?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MediaListResponse {
  items: MediaAssetOut[];
  total: number;
}

export async function fetchMediaAssets(params?: {
  channel_id?: string;
  media_kind?: MediaKind;
  search?: string;
  offset?: number;
  limit?: number;
}): Promise<MediaListResponse> {
  return request<MediaListResponse>('/api/media', {
    query: {
      channel_id: params?.channel_id,
      media_kind: params?.media_kind,
      search: params?.search,
      offset: params?.offset,
      limit: params?.limit,
    },
  });
}

export async function fetchMediaAsset(id: string): Promise<MediaAssetOut> {
  return request<MediaAssetOut>(`/api/media/${id}`);
}

export async function updateMediaAsset(
  id: string,
  body: Partial<{
    title: string;
    description: string | null;
    captured_at: string | null;
    location: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
    channel_id: string;
  }>,
): Promise<MediaAssetOut> {
  return request<MediaAssetOut>(`/api/media/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteMediaAsset(id: string): Promise<void> {
  return request<void>(`/api/media/${id}`, { method: 'DELETE' });
}

export async function uploadMediaAsset(
  channelId: string,
  file: File,
  opts?: { title?: string; description?: string },
): Promise<MediaAssetOut> {
  const form = new FormData();
  form.append('channel_id', channelId);
  form.append('file', file);
  if (opts?.title) form.append('title', opts.title);
  if (opts?.description) form.append('description', opts.description);
  return request<MediaAssetOut>('/api/media/upload', { method: 'POST', body: form });
}

export async function generateMediaAsset(body: {
  channel_id: string;
  media_kind: MediaKind;
  model_id: string;
  prompt: string;
  title?: string;
  size?: string;
  quality?: string;
  duration?: number;
  fps?: number;
  with_audio?: boolean;
  image_url?: string;
}): Promise<{ job_id: number; provider_task_id: string }> {
  return request<{ job_id: number; provider_task_id: string }>('/api/media/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function mediaFileApiPath(assetId: string, relative: 'original' | 'thumb' | 'poster', ext = 'webp'): string {
  if (relative === 'thumb') return `media/${assetId}/thumb.webp`;
  if (relative === 'poster') return `media/${assetId}/poster.webp`;
  return `media/${assetId}/original.${ext}`;
}

export async function resolveMediaFileUrl(assetId: string, filePath: string): Promise<string> {
  const data = await request<{ url: string }>(
    `/api/media/${assetId}/files/${encodeURIComponent(filePath)}`,
    { query: { url_only: true } },
  );
  return data.url;
}

export async function uploadTempMedia(
  channelId: string,
  file: File,
): Promise<{ url: string; key: string }> {
  const form = new FormData();
  form.append('channel_id', channelId);
  form.append('file', file);
  return request<{ url: string; key: string }>('/api/media/upload-temp', { method: 'POST', body: form });
}

export const ACCEPTED_MEDIA = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime';
