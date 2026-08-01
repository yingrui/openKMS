import { request } from './apiClient';

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
  return request<HomeHubResponse>('/api/home/hub');
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
