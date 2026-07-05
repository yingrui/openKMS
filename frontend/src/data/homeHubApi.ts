import { config } from '../config';
import { authAwareFetch, getAuthHeaders } from './apiClient';

export type HomeSiteSummary = {
  document_count: number;
  kb_count: number;
  wiki_page_count: number;
  article_count: number;
};

export type HomeHubResponse = {
  site_summary: HomeSiteSummary;
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

export function siteHasContent(summary: HomeSiteSummary | null | undefined): boolean {
  if (!summary) return false;
  return (
    summary.document_count > 0 ||
    summary.kb_count > 0 ||
    summary.wiki_page_count > 0 ||
    summary.article_count > 0
  );
}
