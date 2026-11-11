/** API for evaluations (KB search retrieval and QA evaluation). */
import { request } from './apiClient';

export type EvaluationKind = 'answer' | 'query' | 'content';

export interface EvaluationResponse {
  id: string;
  name: string;
  /** What the items hold. Decides the editor's columns and which runs are allowed. */
  kind?: EvaluationKind;
  knowledge_base_id: string;
  knowledge_base_name?: string | null;
  wiki_space_id?: string | null;
  wiki_space_name?: string | null;
  /** A data-query evaluation judges this semantic model's answers. */
  semantic_model_id?: string | null;
  data_resource_id?: string | null;
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
  /** Null for a `query` item: its ground truth is `expected_query`. */
  expected_answer: string | null;
  topic?: string | null;
  sort_order: number;
  expected_query?: ExpectedQuery[] | null;
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

/** One query an answer cited — what a data-query evaluation judges (model id + SQL, never the rows). */
/** One query an answer should have made. `sql` is either a feature dict (deterministic) or a raw SQL string (LLM). */
/**
 * One query the answer was expected to make.
 *
 * `expected` says what kind of expectation it is: a saved metric with the definition it had when the expectation was
 * written, a SQL statement, or a requirement to refuse. `model_id` is the semantic model that should have answered.
 */
export interface ExpectedQuery {
  model_id?: string;
  expected?: {
    metric?: { name: string; definition?: Record<string, unknown> | null };
    dimensions?: string[];
    filters?: { field?: string; op?: string; value?: unknown }[];
    sql?: string;
    refuse?: boolean;
  };
  /** Legacy shape, kept for rows written before the expectation carried its kind. */
  metric?: string;
  sql?: { tables?: string[]; columns?: string[]; group_by?: string[]; forbid?: string[] } | string;
}

export interface DataQuerySource {
  mode: string | null;
  model_id: string | null;
  metric: string | null;
  expression?: string | null;
  /** The arguments the query was made with — in metric mode the SQL is generated and its values are parameterised. */
  group_by?: Record<string, unknown>[] | null;
  filters?: Record<string, unknown>[] | null;
  base_dataset?: string | null;
  joins?: string[] | null;
  resource_id?: string | null;
  sql: string | null;
}

/** One of the six things a data-query verdict compares. */
export interface JudgeCheck {
  id: 'model' | 'scope' | 'measure' | 'grain' | 'joins' | 'forbidden';
  verdict: 'pass' | 'fail' | 'unknown';
  expected?: string;
  actual?: string;
  reason?: string | null;
}

/** One expectation checked against the queries of the turn. */
export interface JudgeExpectationVerdict {
  expected_index: number;
  verdict: 'pass' | 'fail' | 'undecided';
  checks: JudgeCheck[];
  reasoning?: string;
  model?: string;
  prompt_version?: string;
  error?: string | null;
  cache_hit?: boolean;
}

/** The verdict for one item: every pair the judge looked at, and the item's overall outcome. */
export interface JudgeVerdict {
  verdict: 'pass' | 'fail' | 'undecided';
  model?: string | null;
  prompt_version?: string | null;
  /** One entry per expectation; the queries of the turn are judged together. */
  verdicts?: JudgeExpectationVerdict[];
}

export interface EvaluationRunResult {
  item_id: string;
  query: string;
  expected_answer: string | null;
  search_results: SearchResultSnippet[];
  generated_answer?: string | null;
  qa_sources?: SearchResultSnippet[];
  data_queries?: DataQuerySource[];
  coverage?: number | null;
  /** What the item expected, so a result can be read without opening the item. */
  expected_query?: ExpectedQuery[] | null;
  /** Expected queries nothing covered, each with the verdict that explains why. */
  uncovered?: Record<string, unknown>[];
  /** Queries cited that covered no expectation. */
  extra_sources?: number;
  /** The judge's structured verdict. */
  judge?: JudgeVerdict | null;
  pass: boolean;
  score: number;
  reasoning: string;
}

export interface RunReportFinding {
  area: 'model_metadata' | 'expectation' | 'skill' | 'agent' | 'harness';
  claim: string;
  /** Item positions (0-based) this finding was drawn from. */
  items: number[];
  suggestion?: string | null;
}

export interface RunReport {
  verdict: string;
  findings: RunReportFinding[];
  model?: string | null;
  prompt_version?: string | null;
  error?: string | null;
}

export interface EvaluationRunResponse {
  run_id: string;
  /** What the run says about the agent as a whole — commentary, never part of the score. */
  report?: RunReport | null;
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
  expected_answer: string | null;
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
  semantic_model_id?: string | null;
  data_resource_id?: string | null;
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
    semantic_model_id?: string | null;
    data_resource_id?: string | null;
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
    expected_answer?: string | null;
    topic?: string | null;
    sort_order?: number;
    /** Data-query ground truth: every query the answer should have made (dict of features, or a raw SQL string). */
    expected_query?: ExpectedQuery[] | null;
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
    expected_answer?: string | null;
    topic?: string | null;
    sort_order?: number;
    expected_query?: ExpectedQuery[] | null;
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
  body?: { evaluation_type?: string; item_ids?: string[] | null; judge_model_id?: string | null }
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
