import { config } from '../config';
import { authAwareFetch, getAuthHeaders } from './apiClient';
import type { KnowledgeMapHtmlStatus, KnowledgeMapNode, ResourceLink } from './knowledgeMapApi';

export type HomeHubKnowledgeMapCounts = {
  node_count: number;
  link_count: number;
};

export type HomeHubWorkItem = {
  id: string;
  relation_type: string;
  source_document_id: string;
  target_document_id: string;
  source_title: string;
  target_title: string;
  created_at: string;
};

export type HomeHubResponse = {
  knowledge_map: HomeHubKnowledgeMapCounts | null;
  work_items: HomeHubWorkItem[];
  share_requests: unknown[];
  knowledge_map_tree: KnowledgeMapNode[] | null;
  resource_links: ResourceLink[] | null;
  map_html_status: KnowledgeMapHtmlStatus | null;
  resource_labels: Record<string, string>;
};

export async function fetchHomeHub(): Promise<HomeHubResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/home/hub`, {
    headers,
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `Home hub failed (${res.status})`);
  }
  return res.json() as Promise<HomeHubResponse>;
}
