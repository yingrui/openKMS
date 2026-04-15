/** API client for feature toggles (backend-persisted). */
import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';

export interface FeatureToggles {
  articles: boolean;
  knowledgeBases: boolean;
  wikiSpaces: boolean;
  objectsAndLinks: boolean;
  evaluationDatasets: boolean;
  hasNeo4jDataSource?: boolean;
}

export async function fetchToggles(): Promise<FeatureToggles> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/feature-toggles`, {
    headers,
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to load feature toggles');
  }
  return res.json();
}

export async function updateToggles(toggles: Partial<FeatureToggles>): Promise<FeatureToggles> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/feature-toggles`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(toggles),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update feature toggles');
  }
  return res.json();
}
