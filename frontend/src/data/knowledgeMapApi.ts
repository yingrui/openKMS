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

export type TaxonomyMapHtmlStatus = {
  current_content_hash: string;
  artifact_content_hash: string | null;
  stale: boolean;
  has_artifact: boolean;
  nodes_modified_at: string | null;
  generated_at: string | null;
};

export async function fetchTaxonomyMapHtmlStatus(): Promise<TaxonomyMapHtmlStatus> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/taxonomy/map-html/status`, {
    headers,
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `Map HTML status failed (${res.status})`);
  }
  return res.json() as Promise<TaxonomyMapHtmlStatus>;
}

export async function regenerateTaxonomyMapHtml(): Promise<{ content_hash: string; generated_at: string }> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/taxonomy/map-html/regenerate`, {
    method: 'POST',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `Regenerate map HTML failed (${res.status})`);
  }
  return res.json() as Promise<{ content_hash: string; generated_at: string }>;
}

export type MapHtmlDesignerMessage = { role: 'user' | 'assistant'; content: string };

export async function postTaxonomyMapHtmlDesignerChat(
  messages: MapHtmlDesignerMessage[],
  workingHtml?: string | null,
): Promise<{ content: string }> {
  const headers = await getAuthHeaders();
  const body: { messages: MapHtmlDesignerMessage[]; working_html?: string; stream?: boolean } = {
    messages,
    stream: false,
  };
  if (workingHtml != null && workingHtml.trim()) {
    body.working_html = workingHtml;
  }
  const res = await authAwareFetch(`${config.apiUrl}/api/taxonomy/map-html/designer/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `Designer chat failed (${res.status})`);
  }
  return res.json() as Promise<{ content: string }>;
}

export type MapHtmlDesignerStreamEvent =
  | { type: 'delta'; t: string }
  | { type: 'tool_start'; run_id: string; name: string; input: string }
  | { type: 'tool_end'; run_id: string; name: string; output: string }
  | { type: 'done'; content: string }
  | { type: 'error'; detail: string };

function parseMapHtmlDesignerStreamLine(line: string): MapHtmlDesignerStreamEvent {
  return JSON.parse(line) as MapHtmlDesignerStreamEvent;
}

/** NDJSON stream: ``delta`` text chunks, optional ``tool_*``, then ``done`` or ``error``. */
export async function postTaxonomyMapHtmlDesignerChatStream(
  messages: MapHtmlDesignerMessage[],
  onEvent: (e: MapHtmlDesignerStreamEvent) => void,
  options?: { workingHtml?: string | null; signal?: AbortSignal },
): Promise<void> {
  const headers = await getAuthHeaders();
  const body: {
    messages: MapHtmlDesignerMessage[];
    working_html?: string;
    stream: boolean;
  } = { messages, stream: true };
  const wh = options?.workingHtml;
  if (wh != null && wh.trim()) {
    body.working_html = wh;
  }
  const res = await authAwareFetch(`${config.apiUrl}/api/taxonomy/map-html/designer/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    credentials: 'include',
    body: JSON.stringify(body),
    signal: options?.signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `Designer chat failed (${res.status})`);
  }
  if (!res.body) {
    throw new Error('No response body');
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (!line.trim()) continue;
      onEvent(parseMapHtmlDesignerStreamLine(line));
    }
  }
  const rest = buf.trim();
  if (rest) {
    onEvent(parseMapHtmlDesignerStreamLine(rest));
  }
}

export async function postTaxonomyMapHtmlPreview(html: string): Promise<{ html: string }> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/taxonomy/map-html/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    credentials: 'include',
    body: JSON.stringify({ html }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `Preview failed (${res.status})`);
  }
  return res.json() as Promise<{ html: string }>;
}

export async function postTaxonomyMapHtmlPublish(html: string): Promise<{ content_hash: string; generated_at: string }> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/taxonomy/map-html/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    credentials: 'include',
    body: JSON.stringify({ html }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `Publish failed (${res.status})`);
  }
  return res.json() as Promise<{ content_hash: string; generated_at: string }>;
}

export async function deleteTaxonomyMapHtml(): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/taxonomy/map-html`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `Delete map HTML failed (${res.status})`);
  }
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
