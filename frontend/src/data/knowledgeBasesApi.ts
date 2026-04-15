/** API for knowledge base management (backend). */
import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';

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
  faq_count: number;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeBaseListResponse {
  items: KnowledgeBaseResponse[];
  total: number;
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
  document_id: string;
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
  data: { question: string; conversation_history?: Array<{ role: string; content: string }> }
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
