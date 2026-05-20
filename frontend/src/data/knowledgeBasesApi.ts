/** API for knowledge base management (backend). */
import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';
import { sortAgentMessagesByCreatedAt, type AgentConversationResponse, type AgentMessageItem } from './agentApi';
import type { JobResponse } from './jobsApi';

// --- Types ---

export interface KnowledgeBaseResponse {
  id: string;
  name: string;
  description?: string | null;
  embedding_model_id?: string | null;
  judge_model_id?: string | null;
  agent_url?: string | null;
  chunk_config?: Record<string, unknown> | null;
  faq_prompt?: string | null;
  metadata_keys?: string[] | null;
  document_count: number;
  wiki_space_count: number;
  faq_count: number;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeBaseListResponse {
  items: KnowledgeBaseResponse[];
  total: number;
}

export interface KBWikiSpaceResponse {
  id: string;
  knowledge_base_id: string;
  wiki_space_id: string;
  wiki_space_name?: string | null;
  created_at: string;
}

export interface KBDocumentResponse {
  id: string;
  knowledge_base_id: string;
  document_id: string;
  document_name?: string | null;
  document_file_type?: string | null;
  document_status?: string | null;
  created_at: string;
}

export interface FAQResponse {
  id: string;
  knowledge_base_id: string;
  document_id?: string | null;
  document_name?: string | null;
  question: string;
  answer: string;
  doc_metadata?: Record<string, unknown> | null;
  has_embedding: boolean;
  created_at: string;
  updated_at: string;
}

export interface FAQListResponse {
  items: FAQResponse[];
  total: number;
}

/** Generated FAQ pair (preview, not yet saved). */
export interface FAQGenerateResult {
  document_id: string;
  document_name?: string | null;
  question: string;
  answer: string;
  doc_metadata?: Record<string, unknown> | null;
}

export interface ChunkResponse {
  id: string;
  knowledge_base_id: string;
  document_id?: string | null;
  wiki_page_id?: string | null;
  wiki_space_id?: string | null;
  document_name?: string | null;
  content: string;
  chunk_index: number;
  token_count?: number | null;
  has_embedding: boolean;
  chunk_metadata?: Record<string, unknown> | null;
  doc_metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface ChunkListResponse {
  items: ChunkResponse[];
  total: number;
}

export interface SearchResult {
  id: string;
  source_type: string;
  content: string;
  score: number;
  source_name?: string | null;
  document_id?: string | null;
  wiki_page_id?: string | null;
  wiki_space_id?: string | null;
  doc_metadata?: Record<string, unknown> | null;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
}

export interface AskResponse {
  answer: string;
  sources: SearchResult[];
}

/** NDJSON events from ``POST .../ask/stream`` (aligned with wiki copilot stream shape). */
export type KbAskStreamEvent =
  | { type: 'delta'; t: string }
  | { type: 'tool_start'; run_id: string; name: string; input: string }
  | { type: 'tool_end'; run_id: string; name: string; output: string }
  | { type: 'tool_error'; run_id: string; name: string; error: string }
  | { type: 'done'; answer: string; sources: SearchResult[] }
  | { type: 'error'; detail: string; answer?: string };

function parseKbAskStreamLine(line: string): KbAskStreamEvent | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  const typ = o.type;
  if (typ === 'delta' && typeof o.t === 'string') {
    return { type: 'delta', t: o.t };
  }
  if (typ === 'tool_start' && typeof o.name === 'string') {
    return {
      type: 'tool_start',
      run_id: typeof o.run_id === 'string' ? o.run_id : '',
      name: o.name,
      input: typeof o.input === 'string' ? o.input : '',
    };
  }
  if (typ === 'tool_end' && typeof o.name === 'string') {
    return {
      type: 'tool_end',
      run_id: typeof o.run_id === 'string' ? o.run_id : '',
      name: o.name,
      output: typeof o.output === 'string' ? o.output : '',
    };
  }
  if (typ === 'tool_error' && typeof o.name === 'string') {
    return {
      type: 'tool_error',
      run_id: typeof o.run_id === 'string' ? o.run_id : '',
      name: o.name,
      error: typeof o.error === 'string' ? o.error : 'Tool error',
    };
  }
  if (typ === 'done' && typeof o.answer === 'string' && Array.isArray(o.sources)) {
    return { type: 'done', answer: o.answer, sources: o.sources as SearchResult[] };
  }
  if (typ === 'error' && typeof o.detail === 'string') {
    return {
      type: 'error',
      detail: o.detail,
      answer: typeof o.answer === 'string' ? o.answer : undefined,
    };
  }
  return null;
}

export async function askQuestionStream(
  kbId: string,
  data: {
    question: string;
    conversation_history?: Array<{ role: string; content: string }>;
    session_id?: string | null;
  },
  onEvent: (e: KbAskStreamEvent) => void,
  options?: { signal?: AbortSignal }
): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases/${kbId}/ask/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
    signal: options?.signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Failed to start answer stream');
  }
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
      const ev = parseKbAskStreamLine(line);
      if (ev) onEvent(ev);
    }
  }
  const rest = buf.trim();
  if (rest) {
    const ev = parseKbAskStreamLine(rest);
    if (ev) onEvent(ev);
  }
}

// --- KB Q&A conversations (persisted like wiki copilot; ``surface=knowledge_base``) ---

const KB_QA_SOURCES_V1 = 'kb_qa_sources_v1';

export { KB_QA_SOURCES_V1 };

const KB_QA_CONV_KEY_PREFIX = 'openkms_kb_qa_conversation_v1_';

export function getStoredKbQaConversationId(kbId: string): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    return sessionStorage.getItem(KB_QA_CONV_KEY_PREFIX + kbId);
  } catch {
    return null;
  }
}

export function setStoredKbQaConversationId(kbId: string, conversationId: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(KB_QA_CONV_KEY_PREFIX + kbId, conversationId);
  } catch {
    /* ignore */
  }
}

export function clearStoredKbQaConversationId(kbId: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(KB_QA_CONV_KEY_PREFIX + kbId);
  } catch {
    /* ignore */
  }
}

export type KbQaPersistedDone = {
  type: 'done';
  answer: string;
  sources: SearchResult[];
  user: AgentMessageItem;
  message: AgentMessageItem;
  stream_ended_without_agent_done?: boolean;
};

export type KbQaPersistedError = {
  type: 'error';
  detail: string;
  message: AgentMessageItem;
  answer?: string;
};

export type KbQaPersistedStreamEvent =
  | { type: 'user'; message: AgentMessageItem }
  | KbAskStreamEvent
  | KbQaPersistedDone
  | KbQaPersistedError;

function parseKbQaPersistedStreamLine(line: string): KbQaPersistedStreamEvent | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  const typ = o.type;
  if (typ === 'user' && o.message && typeof o.message === 'object') {
    return { type: 'user', message: o.message as AgentMessageItem };
  }
  if (
    typ === 'done' &&
    typeof o.answer === 'string' &&
    Array.isArray(o.sources) &&
    o.user &&
    typeof o.user === 'object' &&
    o.message &&
    typeof o.message === 'object'
  ) {
    return {
      type: 'done',
      answer: o.answer,
      sources: o.sources as SearchResult[],
      user: o.user as AgentMessageItem,
      message: o.message as AgentMessageItem,
      stream_ended_without_agent_done: o.stream_ended_without_agent_done === true,
    };
  }
  if (typ === 'error' && typeof o.detail === 'string' && o.message && typeof o.message === 'object') {
    return {
      type: 'error',
      detail: o.detail,
      message: o.message as AgentMessageItem,
      answer: typeof o.answer === 'string' ? o.answer : undefined,
    };
  }
  return parseKbAskStreamLine(line) as KbQaPersistedStreamEvent | null;
}

export async function listKbAgentConversations(
  kbId: string,
  options?: { limit?: number }
): Promise<AgentConversationResponse[]> {
  const headers = await getAuthHeaders();
  const p = new URLSearchParams();
  if (options?.limit) p.set('limit', String(options.limit));
  const q = p.toString();
  const url = `${config.apiUrl}/api/knowledge-bases/${encodeURIComponent(kbId)}/agent-conversations${
    q ? `?${q}` : ''
  }`;
  const res = await authAwareFetch(url, { headers, credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to list conversations: ${res.status}`);
  return res.json();
}

export async function createKbAgentConversation(
  kbId: string,
  body?: { title?: string | null }
): Promise<AgentConversationResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/knowledge-bases/${encodeURIComponent(kbId)}/agent-conversations`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body ?? {}),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Failed to create conversation');
  }
  return res.json();
}

export async function deleteKbAgentConversation(kbId: string, conversationId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/knowledge-bases/${encodeURIComponent(kbId)}/agent-conversations/${encodeURIComponent(
      conversationId
    )}`,
    { method: 'DELETE', headers, credentials: 'include' }
  );
  if (!res.ok) throw new Error(`Failed to delete conversation: ${res.status}`);
}

export interface AgentMessageListResponse {
  items: AgentMessageItem[];
  total: number;
  limit: number;
  offset: number;
}

export async function listKbAgentMessagesPage(
  kbId: string,
  conversationId: string,
  options?: { limit?: number; offset?: number }
): Promise<AgentMessageListResponse> {
  const headers = await getAuthHeaders();
  const p = new URLSearchParams();
  if (options?.limit != null) p.set('limit', String(options.limit));
  if (options?.offset != null) p.set('offset', String(options.offset));
  const q = p.toString();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/knowledge-bases/${encodeURIComponent(kbId)}/agent-conversations/${encodeURIComponent(
      conversationId
    )}/messages${q ? `?${q}` : ''}`,
    { headers, credentials: 'include' }
  );
  if (!res.ok) throw new Error(`Failed to load messages: ${res.status}`);
  return res.json() as Promise<AgentMessageListResponse>;
}

export async function listAllKbAgentMessages(kbId: string, conversationId: string): Promise<AgentMessageItem[]> {
  const pageSize = 200;
  let offset = 0;
  const acc: AgentMessageItem[] = [];
  for (;;) {
    const page = await listKbAgentMessagesPage(kbId, conversationId, { limit: pageSize, offset });
    acc.push(...page.items);
    if (acc.length >= page.total || page.items.length === 0) break;
    offset += page.items.length;
  }
  return sortAgentMessagesByCreatedAt(acc);
}

export async function listKbAgentMessages(kbId: string, conversationId: string): Promise<AgentMessageItem[]> {
  const page = await listKbAgentMessagesPage(kbId, conversationId);
  return page.items;
}

export async function postKbAgentMessageStream(
  kbId: string,
  conversationId: string,
  content: string,
  onEvent: (e: KbQaPersistedStreamEvent) => void,
  options?: { session_id?: string | null; signal?: AbortSignal }
): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/knowledge-bases/${encodeURIComponent(kbId)}/agent-conversations/${encodeURIComponent(
      conversationId
    )}/messages`,
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
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Failed to start answer stream');
  }
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
      const ev = parseKbQaPersistedStreamLine(line);
      if (ev) onEvent(ev);
    }
  }
  const rest = buf.trim();
  if (rest) {
    const ev = parseKbQaPersistedStreamLine(rest);
    if (ev) onEvent(ev);
  }
}

// --- Knowledge Base CRUD ---

export async function fetchKnowledgeBases(): Promise<KnowledgeBaseListResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch knowledge bases: ${res.status}`);
  return res.json();
}

export async function fetchKnowledgeBase(kbId: string): Promise<KnowledgeBaseResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases/${kbId}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch knowledge base: ${res.status}`);
  return res.json();
}

export async function createKnowledgeBase(data: {
  name: string;
  description?: string;
}): Promise<KnowledgeBaseResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create knowledge base');
  }
  return res.json();
}

export async function updateKnowledgeBase(
  kbId: string,
  data: {
    name?: string;
    description?: string;
    embedding_model_id?: string | null;
    judge_model_id?: string | null;
    agent_url?: string | null;
    chunk_config?: Record<string, unknown> | null;
    faq_prompt?: string | null;
    metadata_keys?: string[] | null;
  }
): Promise<KnowledgeBaseResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases/${kbId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update knowledge base');
  }
  return res.json();
}

export async function deleteKnowledgeBase(kbId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases/${kbId}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete knowledge base');
  }
}

// --- KB Documents ---

export async function fetchKBDocuments(kbId: string): Promise<KBDocumentResponse[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases/${kbId}/documents`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch KB documents: ${res.status}`);
  return res.json();
}

export async function addKBDocument(kbId: string, documentId: string): Promise<KBDocumentResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases/${kbId}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ document_id: documentId }),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to add document');
  }
  return res.json();
}

export async function removeKBDocument(kbId: string, documentId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases/${kbId}/documents/${documentId}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to remove document');
  }
}

// --- KB wiki spaces ---

export async function fetchKBWikiSpaces(kbId: string): Promise<KBWikiSpaceResponse[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases/${kbId}/wiki-spaces`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch linked wiki spaces: ${res.status}`);
  return res.json();
}

export async function addKBWikiSpace(kbId: string, wikiSpaceId: string): Promise<KBWikiSpaceResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases/${kbId}/wiki-spaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ wiki_space_id: wikiSpaceId }),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to link wiki space');
  }
  return res.json();
}

export async function removeKBWikiSpace(kbId: string, wikiSpaceId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/knowledge-bases/${kbId}/wiki-spaces/${encodeURIComponent(wikiSpaceId)}`,
    {
      method: 'DELETE',
      headers: { ...headers },
      credentials: 'include',
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to remove wiki space');
  }
}

// --- FAQs ---

export async function fetchFAQs(
  kbId: string,
  params?: { offset?: number; limit?: number }
): Promise<FAQListResponse> {
  const headers = await getAuthHeaders();
  const query = new URLSearchParams();
  if (params?.offset != null) query.set('offset', String(params.offset));
  if (params?.limit != null) query.set('limit', String(params.limit));
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases/${kbId}/faqs${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch FAQs: ${res.status}`);
  return res.json();
}

export async function createFAQ(
  kbId: string,
  data: {
    question: string;
    answer: string;
    document_id?: string;
    doc_metadata?: Record<string, unknown> | null;
  }
): Promise<FAQResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases/${kbId}/faqs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create FAQ');
  }
  return res.json();
}

export async function updateFAQ(
  kbId: string,
  faqId: string,
  data: {
    question?: string;
    answer?: string;
    doc_metadata?: Record<string, unknown> | null;
  }
): Promise<FAQResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases/${kbId}/faqs/${faqId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update FAQ');
  }
  return res.json();
}

export async function deleteFAQ(kbId: string, faqId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases/${kbId}/faqs/${faqId}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete FAQ');
  }
}

/** Generate FAQ pairs (preview only; use saveFAQs to persist). */
export async function generateFAQs(
  kbId: string,
  data: { document_ids: string[]; model_id: string; prompt?: string }
): Promise<FAQGenerateResult[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases/${kbId}/faqs/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to generate FAQs');
  }
  return res.json();
}

/** Save selected FAQ pairs to the knowledge base. */
export async function saveFAQs(
  kbId: string,
  items: {
    document_id: string;
    question: string;
    answer: string;
    labels?: Record<string, unknown> | null;
    doc_metadata?: Record<string, unknown> | null;
  }[]
): Promise<FAQResponse[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases/${kbId}/faqs/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ items }),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to save FAQs');
  }
  return res.json();
}

// --- Chunks ---

export async function fetchChunks(
  kbId: string,
  params?: { offset?: number; limit?: number }
): Promise<ChunkListResponse> {
  const headers = await getAuthHeaders();
  const query = new URLSearchParams();
  if (params?.offset) query.set('offset', String(params.offset));
  if (params?.limit) query.set('limit', String(params.limit));
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases/${kbId}/chunks${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch chunks: ${res.status}`);
  return res.json();
}

export async function updateChunk(
  kbId: string,
  chunkId: string,
  data: { content?: string; doc_metadata?: Record<string, unknown> | null }
): Promise<ChunkResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases/${kbId}/chunks/${chunkId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update chunk');
  }
  return res.json();
}

export async function deleteAllChunks(kbId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases/${kbId}/chunks`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete chunks');
  }
}

// --- Search ---

export async function searchKnowledgeBase(
  kbId: string,
  data: {
    query: string;
    top_k?: number;
    search_type?: string;
    label_filters?: Record<string, string | string[]>;
    metadata_filters?: Record<string, unknown>;
  }
): Promise<SearchResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases/${kbId}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Search failed');
  }
  return res.json();
}

// --- Ask (QA) ---

export async function askQuestion(
  kbId: string,
  data: {
    question: string;
    conversation_history?: Array<{ role: string; content: string }>;
    session_id?: string | null;
  }
): Promise<AskResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases/${kbId}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to get answer');
  }
  return res.json();
}

/** Queue worker `run_kb_index` (openkms-cli kb-index). Same job row shape as `POST /api/jobs`. */
export async function enqueueKnowledgeBaseIndexJob(kbId: string): Promise<JobResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/knowledge-bases/${kbId}/index-job`, {
    method: 'POST',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    const msg =
      typeof detail === 'string'
        ? detail
        : detail && typeof detail === 'object' && 'message' in detail
          ? String((detail as { message?: string }).message)
          : 'Failed to queue indexing job';
    throw new Error(msg);
  }
  return res.json();
}
