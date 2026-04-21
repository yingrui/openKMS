import { config } from '../config';
import { authAwareFetch, getAuthHeaders } from './apiClient';

export type KnowledgeMapNode = {
  id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  sort_order: number;
  link_count: number;
  children: KnowledgeMapNode[];
};

export type ResourceLink = {
  id: string;
  taxonomy_node_id: string;
  resource_type: string;
  resource_id: string;
};

export async function fetchKnowledgeMapTree(): Promise<KnowledgeMapNode[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/taxonomy/nodes/tree`, {
    headers,
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `Knowledge Map failed (${res.status})`);
  }
  return res.json() as Promise<KnowledgeMapNode[]>;
}

export async function createKnowledgeMapNode(body: {
  parent_id?: string | null;
  name: string;
  description?: string | null;
  sort_order?: number;
}): Promise<KnowledgeMapNode> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/taxonomy/nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `Create node failed (${res.status})`);
  }
  return res.json() as Promise<KnowledgeMapNode>;
}

export async function deleteKnowledgeMapNode(nodeId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/taxonomy/nodes/${encodeURIComponent(nodeId)}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `Delete node failed (${res.status})`);
  }
}

export async function updateKnowledgeMapNode(
  nodeId: string,
  body: {
    name?: string;
    description?: string | null;
    sort_order?: number;
    parent_id?: string | null;
  },
): Promise<KnowledgeMapNode> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/taxonomy/nodes/${encodeURIComponent(nodeId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `Update node failed (${res.status})`);
  }
  return res.json() as Promise<KnowledgeMapNode>;
}

export async function fetchResourceLinks(): Promise<ResourceLink[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/taxonomy/resource-links`, {
    headers,
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `List links failed (${res.status})`);
  }
  return res.json() as Promise<ResourceLink[]>;
}

export async function upsertResourceLink(body: {
  taxonomy_node_id: string;
  resource_type: string;
  resource_id: string;
}): Promise<ResourceLink> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/taxonomy/resource-links`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `Save link failed (${res.status})`);
  }
  return res.json() as Promise<ResourceLink>;
}

export async function deleteResourceLink(resourceType: string, resourceId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const q = new URLSearchParams({ resource_type: resourceType, resource_id: resourceId });
  const res = await authAwareFetch(`${config.apiUrl}/api/taxonomy/resource-links?${q}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `Delete link failed (${res.status})`);
  }
}
