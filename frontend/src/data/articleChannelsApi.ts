/** API for article channels (backend). */
import { request } from './apiClient';
import { createChannelTreeApi } from './channelTreeApi';
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

export const articleChannelTreeApi = createChannelTreeApi('/api/article-channels', toChannelNode);

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
