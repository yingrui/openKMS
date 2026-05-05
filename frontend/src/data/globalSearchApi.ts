import { authAwareFetch } from './apiClient';
import { config } from '../config';

export type GlobalSearchHit = {
  id: string;
  name: string;
  title: string | null;
  kind: 'document' | 'article' | 'wiki_space' | 'knowledge_base';
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
  const sp = new URLSearchParams();
  if (params.q?.trim()) sp.set('q', params.q.trim());
  sp.set('types', params.types);
  if (params.document_channel_id) sp.set('document_channel_id', params.document_channel_id);
  if (params.article_channel_id) sp.set('article_channel_id', params.article_channel_id);
  if (params.updated_after) sp.set('updated_after', params.updated_after);
  if (params.updated_before) sp.set('updated_before', params.updated_before);
  if (params.limit != null) sp.set('limit', String(params.limit));
  const qs = sp.toString();
  const url = `${config.apiUrl}/api/search${qs ? `?${qs}` : ''}`;
  const res = await authAwareFetch(url);
  if (!res.ok) {
    const t = await res.text();
    let detail = t;
    try {
      const j = JSON.parse(t) as { detail?: unknown };
      if (typeof j.detail === 'string') detail = j.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Search failed (${res.status})`);
  }
  return res.json() as Promise<GlobalSearchResponse>;
}
