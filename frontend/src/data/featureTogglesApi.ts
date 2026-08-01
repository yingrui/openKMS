/** API client for feature toggles (backend-persisted). */
import { request } from './apiClient';

/** Keys operators may flip in Console → Feature toggles (not derived fields). */
export type FeatureToggleKey = 'evaluations' | 'connectors' | 'agents' | 'media';

export interface FeatureToggles {
  evaluations: boolean;
  connectors: boolean;
  agents: boolean;
  media: boolean;
  hasNeo4jDataSource?: boolean;
}

export async function fetchToggles(): Promise<FeatureToggles> {
  return request<FeatureToggles>('/api/feature-toggles');
}

export async function updateToggles(toggles: Partial<Record<FeatureToggleKey, boolean>>): Promise<FeatureToggles> {
  return request<FeatureToggles>('/api/feature-toggles', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toggles),
  });
}
