/** API for document channels (backend). */
import { request } from './apiClient';

export interface ExtractionSchemaField {
  key: string;
  label: string;
  type: string;
  description?: string;
}

export interface LabelConfigItem {
  key: string;
  object_type_id: string;
  display_label?: string | null;
  type?: 'object_type' | 'list[object_type]';
}

export interface ChannelNode {
  id: string;
  name: string;
  description?: string | null;
  sort_order?: number;
  pipeline_id?: string | null;
  auto_process?: boolean;
  extraction_model_id?: string | null;
  extraction_schema?: ExtractionSchemaField[] | null;
  label_config?: LabelConfigItem[] | null;
  object_type_extraction_max_instances?: number | null;
  children: ChannelNode[];
}

export async function fetchChannelById(channelId: string): Promise<ChannelNode> {
  return request<ChannelNode>(`/api/document-channels/${channelId}`);
}

export interface ChannelTreeListResponse {
  items: ChannelNode[];
  total: number;
  limit: number;
  offset: number;
}

export async function fetchDocumentChannels(params?: {
  limit?: number;
  offset?: number;
}): Promise<ChannelTreeListResponse> {
  return request<ChannelTreeListResponse>('/api/document-channels', {
    query: { limit: params?.limit, offset: params?.offset },
  });
}

/** Load every root channel tree (paginates until all roots are fetched). */
export async function fetchAllDocumentChannels(): Promise<ChannelNode[]> {
  const merged: ChannelNode[] = [];
  let offset = 0;
  const limit = 200;
  let total = 0;
  do {
    const page = await fetchDocumentChannels({ limit, offset });
    merged.push(...page.items);
    total = page.total;
    offset += limit;
  } while (offset < total);
  return merged;
}

export async function createDocumentChannel(params: {
  name: string;
  description?: string | null;
  parent_id?: string | null;
}): Promise<ChannelNode> {
  return request<ChannelNode>('/api/document-channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export async function updateChannel(
  channelId: string,
  params: {
    name?: string;
    description?: string | null;
    parent_id?: string | null;
    pipeline_id?: string | null;
    auto_process?: boolean;
    extraction_model_id?: string | null;
    extraction_schema?: Record<string, unknown> | { key: string; label: string; type: string; description?: string; required?: boolean; object_type_id?: string }[] | null;
    label_config?: LabelConfigItem[] | null;
    object_type_extraction_max_instances?: number | null;
    sort_order?: number;
  },
): Promise<ChannelNode> {
  return request<ChannelNode>(`/api/document-channels/${channelId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export async function mergeChannels(params: {
  source_channel_id: string;
  target_channel_id: string;
  include_descendants?: boolean;
}): Promise<void> {
  return request<void>('/api/document-channels/merge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_channel_id: params.source_channel_id,
      target_channel_id: params.target_channel_id,
      include_descendants: params.include_descendants ?? true,
    }),
  });
}

export async function deleteChannel(channelId: string): Promise<void> {
  return request<void>(`/api/document-channels/${channelId}`, { method: 'DELETE' });
}

export async function reorderChannel(channelId: string, direction: 'up' | 'down'): Promise<void> {
  return request<void>(`/api/document-channels/${channelId}/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction }),
  });
}
