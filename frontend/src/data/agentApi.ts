/** Embedded agent API (LangGraph, `/api/agent`). */
import { request, requestRaw } from './apiClient';

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
  return request<AgentConversationResponse[]>('/api/agent/conversations', {
    query: { wiki_space_id: wikiSpaceId, surface: 'wiki_space', limit: options?.limit },
  });
}

export async function deleteAgentConversation(conversationId: string): Promise<void> {
  return request<void>(`/api/agent/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'DELETE',
  });
}

export async function createAgentConversation(params: {
  surface: 'wiki_space';
  context: { wiki_space_id: string };
}): Promise<AgentConversationResponse> {
  return request<AgentConversationResponse>('/api/agent/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ surface: params.surface, context: params.context }),
  });
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
  return request<AgentMessageListResponse>(
    `/api/agent/conversations/${encodeURIComponent(conversationId)}/messages`,
    { query: { limit: options?.limit, offset: options?.offset } },
  );
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
  return request<{ deleted: number }>(
    `/api/agent/conversations/${encodeURIComponent(conversationId)}/messages/from/${encodeURIComponent(messageId)}`,
    { method: 'DELETE' },
  );
}

export async function postAgentMessage(conversationId: string, content: string): Promise<AgentMessagePostResponse> {
  return request<AgentMessagePostResponse>(
    `/api/agent/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, stream: false }),
    },
  );
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
  const res = await requestRaw(
    `/api/agent/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        stream: true,
        session_id: options?.session_id ?? undefined,
      }),
      signal: options?.signal,
    }
  );
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
