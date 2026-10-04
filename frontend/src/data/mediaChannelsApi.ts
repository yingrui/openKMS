/** API for media channels. */
import { request } from './apiClient';
import { createChannelTreeApi } from './channelTreeApi';
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

export const mediaChannelTreeApi = createChannelTreeApi('/api/media-channels', toChannelNode);

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
