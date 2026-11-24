import { request } from './apiClient';

/** A saved exploration: conditions + layout, re-evaluated whenever it is opened. */
export interface ExplorationResponse {
  id: string;
  name: string;
  object_type_id: string;
  object_type_name: string | null;
  filters: { prop: string; op: string; value: unknown; via?: string }[];
  layout: Record<string, unknown>;
  visibility: 'private' | 'shared';
  owner_sub: string | null;
  owner_name: string | null;
  created_at: string | null;
  updated_at: string | null;
  mine: boolean;
}

export interface ExplorationLayoutResponse {
  object_type_id: string;
  layout: Record<string, unknown>;
  source: 'personal' | 'global' | 'builtin';
}

/** `f` conditions as the reader's `prop:op:value` / `@link/prop:op:value` strings. */
export function filterTexts(
  filters: ExplorationResponse['filters']
): string[] {
  return filters.map((f) =>
    `${f.via ? `@${f.via}/` : ''}${f.prop}:${f.op}:${
      Array.isArray(f.value) ? f.value.join(',') : String(f.value ?? '')
    }`
  );
}

export async function fetchExplorations(objectTypeId?: string): Promise<ExplorationResponse[]> {
  return request<ExplorationResponse[]>('/api/explorations', {
    query: objectTypeId ? { object_type_id: objectTypeId } : undefined,
  });
}

export async function fetchExploration(id: string): Promise<ExplorationResponse> {
  return request<ExplorationResponse>(`/api/explorations/${id}`);
}

export async function createExploration(body: {
  name: string;
  object_type_id: string;
  filters: string[];
  layout: Record<string, unknown>;
  visibility: 'private' | 'shared';
}): Promise<ExplorationResponse> {
  return request<ExplorationResponse>('/api/explorations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function patchExploration(
  id: string,
  body: Partial<Pick<ExplorationResponse, 'name' | 'visibility'> & { filters: string[]; layout: Record<string, unknown> }>
): Promise<ExplorationResponse> {
  return request<ExplorationResponse>(`/api/explorations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteExploration(id: string): Promise<void> {
  return request<void>(`/api/explorations/${id}`, { method: 'DELETE' });
}

/** The layout this type should open with: personal, then global, then the built-in one. */
export async function fetchExplorationLayout(objectTypeId: string): Promise<ExplorationLayoutResponse> {
  return request<ExplorationLayoutResponse>('/api/exploration-layouts', {
    query: { object_type_id: objectTypeId },
  });
}

export async function saveExplorationLayout(
  objectTypeId: string,
  layout: Record<string, unknown>,
  scope: 'personal' | 'global' = 'personal'
): Promise<ExplorationLayoutResponse> {
  return request<ExplorationLayoutResponse>('/api/exploration-layouts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ object_type_id: objectTypeId, layout, scope }),
  });
}
