import { request, requestRaw } from './apiClient';

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
  knowledge_map_node_id: string;
  resource_type: string;
  resource_id: string;
};

export async function fetchKnowledgeMapTree(): Promise<KnowledgeMapNode[]> {
  return request<KnowledgeMapNode[]>('/api/knowledge-map/nodes/tree', { cache: 'no-store' });
}

export async function createKnowledgeMapNode(body: {
  parent_id?: string | null;
  name: string;
  description?: string | null;
  sort_order?: number;
}): Promise<KnowledgeMapNode> {
  return request<KnowledgeMapNode>('/api/knowledge-map/nodes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteKnowledgeMapNode(nodeId: string): Promise<void> {
  return request<void>(`/api/knowledge-map/nodes/${encodeURIComponent(nodeId)}`, { method: 'DELETE' });
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
  return request<KnowledgeMapNode>(`/api/knowledge-map/nodes/${encodeURIComponent(nodeId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchResourceLinks(): Promise<ResourceLink[]> {
  return request<ResourceLink[]>('/api/knowledge-map/resource-links', { cache: 'no-store' });
}

export type KnowledgeMapHtmlStatus = {
  current_content_hash: string;
  artifact_content_hash: string | null;
  stale: boolean;
  has_artifact: boolean;
  nodes_modified_at: string | null;
  generated_at: string | null;
};

export async function fetchKnowledgeMapHtmlStatus(): Promise<KnowledgeMapHtmlStatus> {
  return request<KnowledgeMapHtmlStatus>('/api/knowledge-map/map-html/status', { cache: 'no-store' });
}

export async function regenerateKnowledgeMapHtml(): Promise<{ content_hash: string; generated_at: string }> {
  return request<{ content_hash: string; generated_at: string }>('/api/knowledge-map/map-html/regenerate', {
    method: 'POST',
  });
}

export type MapHtmlDesignerMessage = { role: 'user' | 'assistant'; content: string };

export type MapHtmlDesignerSessionMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

export type MapHtmlDesignerConversation = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export async function fetchKnowledgeMapHtmlDesignerConversations(): Promise<MapHtmlDesignerConversation[]> {
  const data = await request<{ conversations: MapHtmlDesignerConversation[] }>(
    '/api/knowledge-map/map-html/designer/conversations',
    { cache: 'no-store' },
  );
  return data.conversations ?? [];
}

export async function createKnowledgeMapHtmlDesignerConversation(): Promise<MapHtmlDesignerConversation> {
  return request<MapHtmlDesignerConversation>('/api/knowledge-map/map-html/designer/conversations', {
    method: 'POST',
  });
}

export async function fetchKnowledgeMapHtmlDesignerSession(
  conversationId?: string | null,
): Promise<{
  conversation_id: string | null;
  messages: MapHtmlDesignerSessionMessage[];
}> {
  return request<{ conversation_id: string | null; messages: MapHtmlDesignerSessionMessage[] }>(
    '/api/knowledge-map/map-html/designer/session',
    { query: { conversation_id: conversationId?.trim() || undefined }, cache: 'no-store' },
  );
}

export async function deleteKnowledgeMapHtmlDesignerConversation(conversationId: string): Promise<void> {
  return request<void>(
    `/api/knowledge-map/map-html/designer/conversations/${encodeURIComponent(conversationId)}`,
    { method: 'DELETE' },
  );
}

export async function postKnowledgeMapHtmlDesignerChat(
  messages: MapHtmlDesignerMessage[],
  workingHtml?: string | null,
  conversationId?: string | null,
): Promise<{ content: string }> {
  const body: {
    messages: MapHtmlDesignerMessage[];
    working_html?: string;
    stream?: boolean;
    conversation_id?: string;
  } = {
    messages,
    stream: false,
  };
  if (workingHtml != null && workingHtml.trim()) {
    body.working_html = workingHtml;
  }
  if (conversationId != null && conversationId.trim()) {
    body.conversation_id = conversationId.trim();
  }
  return request<{ content: string }>('/api/knowledge-map/map-html/designer/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
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
export async function postKnowledgeMapHtmlDesignerChatStream(
  messages: MapHtmlDesignerMessage[],
  onEvent: (e: MapHtmlDesignerStreamEvent) => void,
  options?: { workingHtml?: string | null; signal?: AbortSignal; conversationId?: string | null },
): Promise<void> {
  const body: {
    messages: MapHtmlDesignerMessage[];
    working_html?: string;
    stream: boolean;
    conversation_id?: string;
  } = { messages, stream: true };
  const wh = options?.workingHtml;
  if (wh != null && wh.trim()) {
    body.working_html = wh;
  }
  const cid = options?.conversationId;
  if (cid != null && cid.trim()) {
    body.conversation_id = cid.trim();
  }
  const res = await requestRaw('/api/knowledge-map/map-html/designer/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  });
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

export async function postKnowledgeMapHtmlPreview(html: string): Promise<{ html: string }> {
  return request<{ html: string }>('/api/knowledge-map/map-html/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html }),
  });
}

export async function postKnowledgeMapHtmlPublish(html: string): Promise<{ content_hash: string; generated_at: string }> {
  return request<{ content_hash: string; generated_at: string }>('/api/knowledge-map/map-html/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html }),
  });
}

export async function deleteKnowledgeMapHtml(): Promise<void> {
  return request<void>('/api/knowledge-map/map-html', { method: 'DELETE' });
}

export async function upsertResourceLink(body: {
  knowledge_map_node_id: string;
  resource_type: string;
  resource_id: string;
}): Promise<ResourceLink> {
  return request<ResourceLink>('/api/knowledge-map/resource-links', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteResourceLink(resourceType: string, resourceId: string): Promise<void> {
  return request<void>('/api/knowledge-map/resource-links', {
    method: 'DELETE',
    query: { resource_type: resourceType, resource_id: resourceId },
  });
}
