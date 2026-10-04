/** API for document channels (backend). */
import { request } from './apiClient';
import { createChannelTreeApi } from './channelTreeApi';

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

export const documentChannelTreeApi = createChannelTreeApi('/api/document-channels', (raw: ChannelNode) => raw);

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
