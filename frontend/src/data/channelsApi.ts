/** API for document channels (backend). */
import { config } from '../config';
import { getAuthHeaders } from './apiClient';

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
  allow_multiple?: boolean;
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
  children: ChannelNode[];
}

export async function fetchDocumentChannels(): Promise<ChannelNode[]> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${config.apiUrl}/api/document-channels`, {
      headers: { ...headers },
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`Failed to fetch channels (${res.status})`);
    return res.json();
  } catch (e) {
    if (e instanceof TypeError && (e as Error).message === 'Failed to fetch') {
      throw new Error(`Cannot connect to backend at ${config.apiUrl}. Is it running?`);
    }
    throw e;
  }
}

function handleNetworkError(e: unknown): never {
  if (e instanceof TypeError && e.message === 'Failed to fetch') {
    throw new Error(`Cannot connect to backend at ${config.apiUrl}. Is it running?`);
  }
  throw e;
}

export async function createDocumentChannel(params: {
  name: string;
  description?: string | null;
  parent_id?: string | null;
}): Promise<ChannelNode> {
  try {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`${config.apiUrl}/api/document-channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(params),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create channel');
    }
    return res.json();
  } catch (e) {
    handleNetworkError(e);
  }
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
    extraction_schema?: Record<string, unknown> | { key: string; label: string; type: string; description?: string; required?: boolean }[] | null;
    label_config?: LabelConfigItem[] | null;
    sort_order?: number;
  },
): Promise<ChannelNode> {
  try {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`${config.apiUrl}/api/document-channels/${channelId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(params),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to update channel');
    }
    return res.json();
  } catch (e) {
    handleNetworkError(e);
  }
}

export async function mergeChannels(params: {
  source_channel_id: string;
  target_channel_id: string;
  include_descendants?: boolean;
}): Promise<void> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/document-channels/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({
      source_channel_id: params.source_channel_id,
      target_channel_id: params.target_channel_id,
      include_descendants: params.include_descendants ?? true,
    }),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to merge channels');
  }
}

export async function deleteChannel(channelId: string): Promise<void> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/document-channels/${channelId}`, {
    method: 'DELETE',
    headers: authHeaders,
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete channel');
  }
}

export async function reorderChannel(channelId: string, direction: 'up' | 'down'): Promise<void> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/document-channels/${channelId}/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ direction }),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to reorder channel');
  }
}
