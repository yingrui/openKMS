/** API for article channels (backend). */
import { request } from './apiClient';
import type { ChannelNode } from './channelUtils';

/** Raw API node (subset of ChannelNode). */
export interface ArticleChannelNodeRaw {
  id: string;
  name: string;
  description?: string | null;
  sort_order?: number;
  review_model_id?: string | null;
  review_prompt?: string | null;
  review_criteria?: { id: string; label: string; description?: string }[] | null;
  children: ArticleChannelNodeRaw[];
}

function toChannelNode(raw: ArticleChannelNodeRaw): ChannelNode {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? null,
    sort_order: raw.sort_order ?? 0,
    pipeline_id: null,
    auto_process: false,
    extraction_model_id: null,
    extraction_schema: null,
    label_config: null,
    object_type_extraction_max_instances: null,
    review_model_id: raw.review_model_id ?? null,
    review_prompt: raw.review_prompt ?? null,
    review_criteria: raw.review_criteria ?? null,
    children: (raw.children ?? []).map(toChannelNode),
  };
}

export async function fetchArticleChannels(params?: {
  limit?: number;
  offset?: number;
}): Promise<ChannelNode[]> {
  const page = await fetchArticleChannelsPage(params);
  return page.items.map(toChannelNode);
}

export interface ArticleChannelTreeListResponse {
  items: ArticleChannelNodeRaw[];
  total: number;
  limit: number;
  offset: number;
}

export async function fetchArticleChannelsPage(params?: {
  limit?: number;
  offset?: number;
}): Promise<ArticleChannelTreeListResponse> {
  return request<ArticleChannelTreeListResponse>('/api/article-channels', {
    query: { limit: params?.limit, offset: params?.offset },
  });
}

export async function fetchAllArticleChannels(): Promise<ChannelNode[]> {
  const merged: ChannelNode[] = [];
  let offset = 0;
  const limit = 200;
  let total = 0;
  do {
    const page = await fetchArticleChannelsPage({ limit, offset });
    merged.push(...page.items.map(toChannelNode));
    total = page.total;
    offset += limit;
  } while (offset < total);
  return merged;
}

export async function createArticleChannel(params: {
  name: string;
  description?: string | null;
  parent_id?: string | null;
}): Promise<ChannelNode> {
  const raw = await request<ArticleChannelNodeRaw>('/api/article-channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return toChannelNode(raw);
}

export async function updateArticleChannel(
  channelId: string,
  params: {
    name?: string;
    description?: string | null;
    parent_id?: string | null;
    sort_order?: number;
    review_model_id?: string | null;
    review_prompt?: string | null;
    review_criteria?: { id: string; label: string; description?: string }[] | null;
  },
): Promise<ChannelNode> {
  const raw = await request<ArticleChannelNodeRaw>(`/api/article-channels/${channelId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return toChannelNode(raw);
}

export async function deleteArticleChannel(channelId: string): Promise<void> {
  return request<void>(`/api/article-channels/${channelId}`, { method: 'DELETE' });
}

export async function mergeArticleChannels(params: {
  source_channel_id: string;
  target_channel_id: string;
  include_descendants?: boolean;
}): Promise<void> {
  return request<void>('/api/article-channels/merge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_channel_id: params.source_channel_id,
      target_channel_id: params.target_channel_id,
      include_descendants: params.include_descendants ?? true,
    }),
  });
}

export async function reorderArticleChannel(channelId: string, direction: 'up' | 'down'): Promise<void> {
  return request<void>(`/api/article-channels/${channelId}/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction }),
  });
}
