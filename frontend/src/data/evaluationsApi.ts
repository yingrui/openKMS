/** API for evaluations (KB search retrieval and QA evaluation). */
import { request } from './apiClient';

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
  return request<EvaluationListResponse>('/api/evaluations', {
    query: {
      knowledge_base_id: params?.knowledge_base_id,
      limit: params?.limit,
      offset: params?.offset,
    },
  });
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
  return request<EvaluationResponse>(`/api/evaluations/${id}`);
}

export async function createEvaluation(data: {
  name: string;
  knowledge_base_id: string;
  wiki_space_id?: string | null;
  description?: string | null;
}): Promise<EvaluationResponse> {
  return request<EvaluationResponse>('/api/evaluations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
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
  return request<EvaluationResponse>(`/api/evaluations/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteEvaluation(id: string): Promise<void> {
  return request<void>(`/api/evaluations/${id}`, { method: 'DELETE' });
}

export async function fetchEvaluationItems(
  evaluationId: string,
  params?: { offset?: number; limit?: number }
): Promise<EvaluationItemListResponse> {
  return request<EvaluationItemListResponse>(`/api/evaluations/${evaluationId}/items`, {
    query: { offset: params?.offset, limit: params?.limit },
  });
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
  return request<EvaluationItemResponse>(`/api/evaluations/${evaluationId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
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
  return request<EvaluationItemResponse>(`/api/evaluations/${evaluationId}/items/${itemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteEvaluationItem(evaluationId: string, itemId: string): Promise<void> {
  return request<void>(`/api/evaluations/${evaluationId}/items/${itemId}`, { method: 'DELETE' });
}

export async function importEvaluationItems(
  evaluationId: string,
  file: File
): Promise<{ imported: number }> {
  const formData = new FormData();
  formData.append('file', file);
  return request<{ imported: number }>(`/api/evaluations/${evaluationId}/items/import`, {
    method: 'POST',
    body: formData,
  });
}

export async function runEvaluation(
  evaluationId: string,
  body?: { evaluation_type?: string }
): Promise<EvaluationRunResponse> {
  return request<EvaluationRunResponse>(`/api/evaluations/${evaluationId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      evaluation_type: body?.evaluation_type ?? 'search_retrieval',
    }),
  });
}

export async function listEvaluationRuns(
  evaluationId: string,
  params?: { offset?: number; limit?: number }
): Promise<EvaluationRunListResponse> {
  return request<EvaluationRunListResponse>(`/api/evaluations/${evaluationId}/runs`, {
    query: { offset: params?.offset, limit: params?.limit },
  });
}

export async function getEvaluationRun(
  evaluationId: string,
  runId: string
): Promise<EvaluationRunResponse> {
  return request<EvaluationRunResponse>(
    `/api/evaluations/${evaluationId}/runs/${encodeURIComponent(runId)}`
  );
}

export async function deleteEvaluationRun(evaluationId: string, runId: string): Promise<void> {
  return request<void>(`/api/evaluations/${evaluationId}/runs/${encodeURIComponent(runId)}`, {
    method: 'DELETE',
  });
}

export async function compareEvaluationRuns(
  evaluationId: string,
  runA: string,
  runB: string
): Promise<EvaluationCompareResponse> {
  return request<EvaluationCompareResponse>(`/api/evaluations/${evaluationId}/runs/compare`, {
    query: { run_a: runA, run_b: runB },
  });
}
