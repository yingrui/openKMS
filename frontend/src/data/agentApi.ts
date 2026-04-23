/** Embedded agent API (LangGraph, `/api/agent`). */
import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';

async function parseError(res: Response): Promise<string> {
  let msg = res.statusText;
  try {
    const j = await res.json();
    if (typeof j.detail === 'string') msg = j.detail;
  } catch {
    /* ignore */
  }
  return msg;
}

export interface AgentConversationResponse {
  id: string;
  user_sub: string;
  surface: string;
  context: Record<string, unknown>;
  title?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentMessageItem {
  id: string;
  role: string;
  content: string;
  tool_calls?: unknown;
  created_at: string;
}

export interface AgentMessagePostResponse {
  message: AgentMessageItem;
  assistant: AgentMessageItem;
}

const CONV_KEY_PREFIX = 'openkms_wiki_agent_conversation_v1_';

export function getStoredWikiAgentConversationId(spaceId: string): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(CONV_KEY_PREFIX + spaceId);
}

export function setStoredWikiAgentConversationId(spaceId: string, conversationId: string): void {
  sessionStorage.setItem(CONV_KEY_PREFIX + spaceId, conversationId);
}

export function clearStoredWikiAgentConversationId(spaceId: string): void {
  sessionStorage.removeItem(CONV_KEY_PREFIX + spaceId);
}

export async function listAgentConversationsForWiki(
  wikiSpaceId: string,
  options?: { limit?: number }
): Promise<AgentConversationResponse[]> {
  const headers = await getAuthHeaders();
  const p = new URLSearchParams();
  p.set('wiki_space_id', wikiSpaceId);
  p.set('surface', 'wiki_space');
  if (options?.limit) p.set('limit', String(options.limit));
  const res = await authAwareFetch(
    `${config.apiUrl}/api/agent/conversations?${p.toString()}`,
    { headers, credentials: 'include' }
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteAgentConversation(conversationId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/agent/conversations/${encodeURIComponent(conversationId)}`,
    { method: 'DELETE', headers, credentials: 'include' }
  );
  if (!res.ok) throw new Error(await parseError(res));
}

export async function createAgentConversation(params: {
  surface: 'wiki_space';
  context: { wiki_space_id: string };
}): Promise<AgentConversationResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/agent/conversations`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ surface: params.surface, context: params.context }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function listAgentMessages(conversationId: string): Promise<AgentMessageItem[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/agent/conversations/${encodeURIComponent(conversationId)}/messages`, {
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

/** Remove this message and all later messages; user can resend from the input. */
export async function truncateAgentMessagesFromMessage(
  conversationId: string,
  messageId: string
): Promise<{ deleted: number }> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/agent/conversations/${encodeURIComponent(
      conversationId
    )}/messages/from/${encodeURIComponent(messageId)}`,
    { method: 'DELETE', headers, credentials: 'include' }
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<{ deleted: number }>;
}

export async function postAgentMessage(conversationId: string, content: string): Promise<AgentMessagePostResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/agent/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ content, stream: false }),
    }
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

/** NDJSON events from `POST .../messages` with `{ stream: true }`. */
export type AgentMessageStreamEvent =
  | { type: 'user'; message: AgentMessageItem }
  | { type: 'delta'; t: string }
  | {
      type: 'tool_start';
      run_id: string;
      name: string;
      input: string;
    }
  | { type: 'tool_end'; run_id: string; name: string; output: string }
  | { type: 'tool_error'; run_id: string; name: string; error: string }
  | { type: 'done'; user: AgentMessageItem; message: AgentMessageItem }
  | { type: 'error'; detail: string; message: AgentMessageItem };

/**
 * Stream one assistant turn: user line, then `delta` chunks, then `done` (or `error` with final assistant message).
 */
export async function postAgentMessageStream(
  conversationId: string,
  content: string,
  onEvent: (e: AgentMessageStreamEvent) => void,
  options?: { signal?: AbortSignal }
): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/agent/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ content, stream: true }),
      signal: options?.signal,
    }
  );
  if (!res.ok) throw new Error(await parseError(res));
  if (!res.body) throw new Error('No response body');
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
      onEvent(JSON.parse(line) as AgentMessageStreamEvent);
    }
  }
  const rest = buf.trim();
  if (rest) onEvent(JSON.parse(rest) as AgentMessageStreamEvent);
}
