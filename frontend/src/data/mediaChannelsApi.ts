/** API for media channels. */
import { request } from './apiClient';
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
  return request<MediaChannelTreeListResponse>('/api/media-channels', {
    query: { limit: params?.limit, offset: params?.offset },
  });
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
  const raw = await request<MediaChannelNodeRaw>('/api/media-channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
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
  const raw = await request<MediaChannelNodeRaw>(`/api/media-channels/${channelId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return toChannelNode(raw);
}

export async function deleteMediaChannel(channelId: string): Promise<void> {
  return request<void>(`/api/media-channels/${channelId}`, { method: 'DELETE' });
}

export async function mergeMediaChannels(params: {
  source_channel_id: string;
  target_channel_id: string;
  include_descendants?: boolean;
}): Promise<void> {
  return request<void>('/api/media-channels/merge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_channel_id: params.source_channel_id,
      target_channel_id: params.target_channel_id,
      include_descendants: params.include_descendants ?? true,
    }),
  });
}

export async function reorderMediaChannel(channelId: string, direction: 'up' | 'down'): Promise<void> {
  return request<void>(`/api/media-channels/${channelId}/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction }),
  });
}
