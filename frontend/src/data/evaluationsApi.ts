/** API for evaluations (KB search retrieval and QA evaluation). */
import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';

export interface EvaluationResponse {
  id: string;
  name: string;
  knowledge_base_id: string;
  knowledge_base_name?: string | null;
  wiki_space_id?: string | null;
  wiki_space_name?: string | null;
  description?: string | null;
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface EvaluationListResponse {
  items: EvaluationResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface EvaluationItemResponse {
  id: string;
  evaluation_id: string;
  query: string;
  expected_answer: string;
  topic?: string | null;
  sort_order: number;
  created_at: string;
}

export interface EvaluationItemListResponse {
  items: EvaluationItemResponse[];
  total: number;
}

export interface SearchResultSnippet {
  content: string;
  score: number;
  source_type: string;
}

export interface EvaluationRunResult {
  item_id: string;
  query: string;
  expected_answer: string;
  search_results: SearchResultSnippet[];
  generated_answer?: string | null;
  qa_sources?: SearchResultSnippet[];
  pass: boolean;
  score: number;
  reasoning: string;
}

export interface EvaluationRunResponse {
  run_id: string;
  evaluation_type: string;
  status: string;
  item_count: number;
  pass_count: number;
  avg_score: number | null;
  error_message?: string | null;
  results: EvaluationRunResult[];
}

export interface EvaluationRunListItem {
  id: string;
  evaluation_type: string;
  status: string;
  item_count: number;
  pass_count: number;
  avg_score: number | null;
  created_at: string;
}

export interface EvaluationRunListResponse {
  items: EvaluationRunListItem[];
  total: number;
}

export interface EvaluationCompareRow {
  evaluation_item_id: string;
  query: string;
  expected_answer: string;
  pass_a: boolean;
  score_a: number;
  pass_b: boolean;
  score_b: number;
  pass_changed: boolean;
  score_delta: number;
}

export interface EvaluationCompareResponse {
  run_a_id: string;
  run_b_id: string;
  evaluation_type_a: string;
  evaluation_type_b: string;
  rows: EvaluationCompareRow[];
}

export async function fetchEvaluations(params?: {
  knowledge_base_id?: string;
  limit?: number;
  offset?: number;
}): Promise<EvaluationListResponse> {
  const headers = await getAuthHeaders();
  const query = new URLSearchParams();
  if (params?.knowledge_base_id) query.set('knowledge_base_id', params.knowledge_base_id);
  if (params?.limit != null) query.set('limit', String(params.limit));
  if (params?.offset != null) query.set('offset', String(params.offset));
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await authAwareFetch(`${config.apiUrl}/api/evaluations${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch evaluations: ${res.status}`);
  return res.json();
}

/** Full list for dropdowns. Paginates at API max page size (200). */
export async function fetchAllEvaluations(params?: {
  knowledge_base_id?: string;
}): Promise<EvaluationResponse[]> {
  const items: EvaluationResponse[] = [];
  let offset = 0;
  let total = 0;
  do {
    const page = await fetchEvaluations({ ...params, limit: 200, offset });
    items.push(...page.items);
    total = page.total;
    offset += page.items.length;
    if (page.items.length === 0) break;
  } while (offset < total);
  return items;
}

export async function fetchEvaluation(id: string): Promise<EvaluationResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/evaluations/${id}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch evaluation: ${res.status}`);
  return res.json();
}

export async function createEvaluation(data: {
  name: string;
  knowledge_base_id: string;
  wiki_space_id?: string | null;
  description?: string | null;
}): Promise<EvaluationResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/evaluations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create evaluation');
  }
  return res.json();
}

export async function updateEvaluation(
  id: string,
  data: {
    name?: string;
    description?: string | null;
    knowledge_base_id?: string;
    wiki_space_id?: string | null;
  }
): Promise<EvaluationResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/evaluations/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update evaluation');
  }
  return res.json();
}

export async function deleteEvaluation(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/evaluations/${id}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to delete evaluation: ${res.status}`);
}

export async function fetchEvaluationItems(
  evaluationId: string,
  params?: { offset?: number; limit?: number }
): Promise<EvaluationItemListResponse> {
  const headers = await getAuthHeaders();
  const q = new URLSearchParams();
  if (params?.offset != null) q.set('offset', String(params.offset));
  if (params?.limit != null) q.set('limit', String(params.limit));
  const qs = q.toString() ? `?${q.toString()}` : '';
  const res = await authAwareFetch(`${config.apiUrl}/api/evaluations/${evaluationId}/items${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch evaluation items: ${res.status}`);
  return res.json();
}

export async function createEvaluationItem(
  evaluationId: string,
  data: {
    query: string;
    expected_answer: string;
    topic?: string | null;
    sort_order?: number;
  }
): Promise<EvaluationItemResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/evaluations/${evaluationId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to add evaluation item');
  }
  return res.json();
}

export async function updateEvaluationItem(
  evaluationId: string,
  itemId: string,
  data: {
    query?: string;
    expected_answer?: string;
    topic?: string | null;
    sort_order?: number;
  }
): Promise<EvaluationItemResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/evaluations/${evaluationId}/items/${itemId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data),
      credentials: 'include',
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update evaluation item');
  }
  return res.json();
}

export async function deleteEvaluationItem(evaluationId: string, itemId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/evaluations/${evaluationId}/items/${itemId}`,
    {
      method: 'DELETE',
      headers: { ...headers },
      credentials: 'include',
    }
  );
  if (!res.ok) throw new Error(`Failed to delete evaluation item: ${res.status}`);
}

export async function importEvaluationItems(
  evaluationId: string,
  file: File
): Promise<{ imported: number }> {
  const headers = await getAuthHeaders();
  const formData = new FormData();
  formData.append('file', file);
  const res = await authAwareFetch(`${config.apiUrl}/api/evaluations/${evaluationId}/items/import`, {
    method: 'POST',
    headers: { ...headers },
    body: formData,
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to import CSV');
  }
  return res.json();
}

export async function runEvaluation(
  evaluationId: string,
  body?: { evaluation_type?: string }
): Promise<EvaluationRunResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/evaluations/${evaluationId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      evaluation_type: body?.evaluation_type ?? 'search_retrieval',
    }),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to run evaluation');
  }
  return res.json();
}

export async function listEvaluationRuns(
  evaluationId: string,
  params?: { offset?: number; limit?: number }
): Promise<EvaluationRunListResponse> {
  const headers = await getAuthHeaders();
  const q = new URLSearchParams();
  if (params?.offset != null) q.set('offset', String(params.offset));
  if (params?.limit != null) q.set('limit', String(params.limit));
  const qs = q.toString() ? `?${q.toString()}` : '';
  const res = await authAwareFetch(`${config.apiUrl}/api/evaluations/${evaluationId}/runs${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to list evaluation runs: ${res.status}`);
  return res.json();
}

export async function getEvaluationRun(
  evaluationId: string,
  runId: string
): Promise<EvaluationRunResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/evaluations/${evaluationId}/runs/${encodeURIComponent(runId)}`,
    { headers: { ...headers }, credentials: 'include' }
  );
  if (!res.ok) throw new Error(`Failed to load evaluation run: ${res.status}`);
  return res.json();
}

export async function deleteEvaluationRun(evaluationId: string, runId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/evaluations/${evaluationId}/runs/${encodeURIComponent(runId)}`,
    { method: 'DELETE', headers: { ...headers }, credentials: 'include' }
  );
  if (!res.ok) throw new Error(`Failed to delete evaluation run: ${res.status}`);
}

export async function compareEvaluationRuns(
  evaluationId: string,
  runA: string,
  runB: string
): Promise<EvaluationCompareResponse> {
  const headers = await getAuthHeaders();
  const q = new URLSearchParams({ run_a: runA, run_b: runB });
  const res = await authAwareFetch(
    `${config.apiUrl}/api/evaluations/${evaluationId}/runs/compare?${q.toString()}`,
    { headers: { ...headers }, credentials: 'include' }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to compare runs');
  }
  return res.json();
}
