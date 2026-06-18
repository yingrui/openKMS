/** API for media assets. */
import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';

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
  const query = new URLSearchParams();
  if (params?.channel_id) query.set('channel_id', params.channel_id);
  if (params?.media_kind) query.set('media_kind', params.media_kind);
  if (params?.search) query.set('search', params.search);
  if (params?.offset != null) query.set('offset', String(params.offset));
  if (params?.limit != null) query.set('limit', String(params.limit));
  const qs = query.toString();
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/media${qs ? `?${qs}` : ''}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch media (${res.status})`);
  return res.json();
}

export async function fetchMediaAsset(id: string): Promise<MediaAssetOut> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/media/${id}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch media asset (${res.status})`);
  return res.json();
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
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/media/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update media');
  }
  return res.json();
}

export async function deleteMediaAsset(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/media/${id}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete media');
  }
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
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/media/upload`, {
    method: 'POST',
    headers: { ...headers },
    body: form,
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Upload failed');
  }
  return res.json();
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
  image_url?: string;
}): Promise<{ job_id: number; provider_task_id: string }> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/media/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Generation failed');
  }
  return res.json();
}

export function mediaFileApiPath(assetId: string, relative: 'original' | 'thumb' | 'poster', ext = 'webp'): string {
  if (relative === 'thumb') return `media/${assetId}/thumb.webp`;
  if (relative === 'poster') return `media/${assetId}/poster.webp`;
  return `media/${assetId}/original.${ext}`;
}

export async function resolveMediaFileUrl(assetId: string, filePath: string): Promise<string> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/media/${assetId}/files/${encodeURIComponent(filePath)}?url_only=true`,
    { headers: { ...headers }, credentials: 'include' },
  );
  if (!res.ok) throw new Error('Failed to resolve media URL');
  const data = await res.json();
  return data.url as string;
}

export const ACCEPTED_MEDIA = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime';
