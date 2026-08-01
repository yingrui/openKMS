import { request } from './apiClient';

export type GlobalSearchHit = {
  id: string;
  name: string;
  title: string | null;
  kind: 'document' | 'article' | 'wiki_space' | 'knowledge_base' | 'media';
  url_path: string;
  channel_id: string | null;
  channel_name: string | null;
  updated_at: string;
};

export type GlobalSearchSection = {
  items: GlobalSearchHit[];
  total: number;
};

export type GlobalSearchResponse = {
  query: string;
  types_requested: string[];
  documents: GlobalSearchSection;
  articles: GlobalSearchSection;
  wiki_spaces: GlobalSearchSection;
  knowledge_bases: GlobalSearchSection;
  media?: GlobalSearchSection;
};

export type GlobalSearchParams = {
  q?: string;
  types: string;
  document_channel_id?: string;
  article_channel_id?: string;
  updated_after?: string;
  updated_before?: string;
  limit?: number;
};

export async function fetchGlobalSearch(params: GlobalSearchParams): Promise<GlobalSearchResponse> {
  return request<GlobalSearchResponse>('/api/search', {
    query: {
      q: params.q?.trim() || undefined,
      types: params.types,
      document_channel_id: params.document_channel_id,
      article_channel_id: params.article_channel_id,
      updated_after: params.updated_after,
      updated_before: params.updated_before,
      limit: params.limit,
    },
  });
}
