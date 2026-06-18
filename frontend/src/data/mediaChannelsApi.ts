/** API for media channels. */
import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';
import type { ChannelNode, ExtractionSchemaField } from './channelUtils';

export interface MediaChannelNodeRaw {
  id: string;
  name: string;
  description?: string | null;
  sort_order?: number;
  metadata_schema?: ExtractionSchemaField[] | null;
  default_image_model_id?: string | null;
  default_video_model_id?: string | null;
  children: MediaChannelNodeRaw[];
}

function toChannelNode(raw: MediaChannelNodeRaw): ChannelNode {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? null,
    sort_order: raw.sort_order ?? 0,
    metadata_schema: raw.metadata_schema ?? null,
    default_image_model_id: raw.default_image_model_id ?? null,
    default_video_model_id: raw.default_video_model_id ?? null,
    children: (raw.children ?? []).map(toChannelNode),
  };
}

export interface MediaChannelTreeListResponse {
  items: MediaChannelNodeRaw[];
  total: number;
  limit: number;
  offset: number;
}

export async function fetchMediaChannelsPage(params?: {
  limit?: number;
  offset?: number;
}): Promise<MediaChannelTreeListResponse> {
  const query = new URLSearchParams();
  if (params?.limit != null) query.set('limit', String(params.limit));
  if (params?.offset != null) query.set('offset', String(params.offset));
  const qs = query.toString();
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/media-channels${qs ? `?${qs}` : ''}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch media channels (${res.status})`);
  return res.json();
}

export async function fetchAllMediaChannels(): Promise<ChannelNode[]> {
  const merged: ChannelNode[] = [];
  let offset = 0;
  const limit = 200;
  let total = 0;
  do {
    const page = await fetchMediaChannelsPage({ limit, offset });
    merged.push(...page.items.map(toChannelNode));
    total = page.total;
    offset += limit;
  } while (offset < total);
  return merged;
}

export async function createMediaChannel(body: {
  name: string;
  description?: string | null;
  parent_id?: string | null;
}): Promise<ChannelNode> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/media-channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create channel');
  }
  const raw: MediaChannelNodeRaw = await res.json();
  return toChannelNode(raw);
}

export async function updateMediaChannel(
  channelId: string,
  body: Partial<{
    name: string;
    description: string | null;
    parent_id: string | null;
    metadata_schema: ExtractionSchemaField[] | null;
    default_image_model_id: string | null;
    default_video_model_id: string | null;
  }>,
): Promise<ChannelNode> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/media-channels/${channelId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update channel');
  }
  const raw: MediaChannelNodeRaw = await res.json();
  return toChannelNode(raw);
}

export async function deleteMediaChannel(channelId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/media-channels/${channelId}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete channel');
  }
}

export async function reorderMediaChannel(channelId: string, direction: 'up' | 'down'): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/media-channels/${channelId}/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ direction }),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to reorder channel');
  }
}
