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
  /** Wiki Copilot stores `wiki_tool_traces_v1` here for history replay in the UI. */
  tool_calls?: unknown;
  created_at: string;
}

/** Thread replay order: timestamp, then id (matches list APIs; helps legacy rows with identical created_at). */
export function sortAgentMessagesByCreatedAt(items: AgentMessageItem[]): AgentMessageItem[] {
  return [...items].sort((a, b) => {
    const ta = Date.parse(a.created_at);
    const tb = Date.parse(b.created_at);
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

export interface AgentMessagePostResponse {
  message: AgentMessageItem;
  assistant: AgentMessageItem;
}

const CONV_KEY_PREFIX = 'openkms_wiki_agent_conversation_v1_';

export function getStoredWikiAgentConversationId(spaceId: string): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    return sessionStorage.getItem(CONV_KEY_PREFIX + spaceId);
  } catch {
    return null;
  }
}

export function setStoredWikiAgentConversationId(spaceId: string, conversationId: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(CONV_KEY_PREFIX + spaceId, conversationId);
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearStoredWikiAgentConversationId(spaceId: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(CONV_KEY_PREFIX + spaceId);
  } catch {
    /* ignore */
  }
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

export interface AgentMessageListResponse {
  items: AgentMessageItem[];
  total: number;
  limit: number;
  offset: number;
}

export async function listAgentMessagesPage(
  conversationId: string,
  options?: { limit?: number; offset?: number }
): Promise<AgentMessageListResponse> {
  const headers = await getAuthHeaders();
  const p = new URLSearchParams();
  if (options?.limit != null) p.set('limit', String(options.limit));
  if (options?.offset != null) p.set('offset', String(options.offset));
  const q = p.toString();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/agent/conversations/${encodeURIComponent(conversationId)}/messages${q ? `?${q}` : ''}`,
    { headers, credentials: 'include' }
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<AgentMessageListResponse>;
}

/** Loads all pages (bounded server max per page) for long threads. */
export async function listAllAgentMessages(conversationId: string): Promise<AgentMessageItem[]> {
  const pageSize = 200;
  let offset = 0;
  const acc: AgentMessageItem[] = [];
  for (;;) {
    const page = await listAgentMessagesPage(conversationId, { limit: pageSize, offset });
    acc.push(...page.items);
    if (acc.length >= page.total || page.items.length === 0) break;
    offset += page.items.length;
  }
  return sortAgentMessagesByCreatedAt(acc);
}

export async function listAgentMessages(conversationId: string): Promise<AgentMessageItem[]> {
  const page = await listAgentMessagesPage(conversationId);
  return page.items;
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
  | { type: 'done'; user: AgentMessageItem; message: AgentMessageItem; stream_ended_without_agent_done?: boolean }
  | { type: 'error'; detail: string; message: AgentMessageItem };

function parseNdjsonStreamLine(line: string): AgentMessageStreamEvent {
  try {
    return JSON.parse(line) as AgentMessageStreamEvent;
  } catch {
    throw new Error('Agent stream contained invalid JSON');
  }
}

/**
 * Stream one assistant turn: user line, then `delta` chunks, then `done` (or `error` with final assistant message).
 */
export async function postAgentMessageStream(
  conversationId: string,
  content: string,
  onEvent: (e: AgentMessageStreamEvent) => void,
  options?: { signal?: AbortSignal; session_id?: string | null }
): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/agent/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        content,
        stream: true,
        session_id: options?.session_id ?? undefined,
      }),
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
      onEvent(parseNdjsonStreamLine(line));
    }
  }
  const rest = buf.trim();
  if (rest) {
    onEvent(parseNdjsonStreamLine(rest));
  }
}
