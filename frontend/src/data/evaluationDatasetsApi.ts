/** API for evaluation datasets (KB search retrieval evaluation). */
import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';

export interface EvaluationDatasetResponse {
  id: string;
  name: string;
  knowledge_base_id: string;
  knowledge_base_name?: string | null;
  description?: string | null;
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface EvaluationDatasetListResponse {
  items: EvaluationDatasetResponse[];
  total: number;
}

export interface EvaluationDatasetItemResponse {
  id: string;
  evaluation_dataset_id: string;
  query: string;
  expected_answer: string;
  topic?: string | null;
  sort_order: number;
  created_at: string;
}

export interface EvaluationDatasetItemListResponse {
  items: EvaluationDatasetItemResponse[];
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
  judge_model_id?: string | null;
  judge_model_name?: string | null;
}

export interface EvaluationRunListResponse {
  items: EvaluationRunListItem[];
  total: number;
}

export interface EvaluationCompareRow {
  evaluation_dataset_item_id: string;
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

export async function fetchEvaluationDatasets(params?: {
  knowledge_base_id?: string;
}): Promise<EvaluationDatasetListResponse> {
  const headers = await getAuthHeaders();
  const query = new URLSearchParams();
  if (params?.knowledge_base_id) query.set('knowledge_base_id', params.knowledge_base_id);
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await authAwareFetch(`${config.apiUrl}/api/evaluation-datasets${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch evaluation datasets: ${res.status}`);
  return res.json();
}

export async function fetchEvaluationDataset(id: string): Promise<EvaluationDatasetResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/evaluation-datasets/${id}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch evaluation dataset: ${res.status}`);
  return res.json();
}

export async function createEvaluationDataset(data: {
  name: string;
  knowledge_base_id: string;
  description?: string | null;
}): Promise<EvaluationDatasetResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/evaluation-datasets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create evaluation dataset');
  }
  return res.json();
}

export async function updateEvaluationDataset(
  id: string,
  data: { name?: string; description?: string | null }
): Promise<EvaluationDatasetResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/evaluation-datasets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update evaluation dataset');
  }
  return res.json();
}

export async function deleteEvaluationDataset(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/evaluation-datasets/${id}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to delete evaluation dataset: ${res.status}`);
}

export async function fetchEvaluationDatasetItems(
  datasetId: string,
  params?: { offset?: number; limit?: number }
): Promise<EvaluationDatasetItemListResponse> {
  const headers = await getAuthHeaders();
  const q = new URLSearchParams();
  if (params?.offset != null) q.set('offset', String(params.offset));
  if (params?.limit != null) q.set('limit', String(params.limit));
  const qs = q.toString() ? `?${q.toString()}` : '';
  const res = await authAwareFetch(`${config.apiUrl}/api/evaluation-datasets/${datasetId}/items${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch evaluation dataset items: ${res.status}`);
  return res.json();
}

export async function createEvaluationDatasetItem(
  datasetId: string,
  data: { query: string; expected_answer: string; topic?: string | null; sort_order?: number }
): Promise<EvaluationDatasetItemResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/evaluation-datasets/${datasetId}/items`, {
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

export async function updateEvaluationDatasetItem(
  datasetId: string,
  itemId: string,
  data: { query?: string; expected_answer?: string; topic?: string | null; sort_order?: number }
): Promise<EvaluationDatasetItemResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/evaluation-datasets/${datasetId}/items/${itemId}`,
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

export async function deleteEvaluationDatasetItem(
  datasetId: string,
  itemId: string
): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/evaluation-datasets/${datasetId}/items/${itemId}`,
    {
      method: 'DELETE',
      headers: { ...headers },
      credentials: 'include',
    }
  );
  if (!res.ok) throw new Error(`Failed to delete evaluation item: ${res.status}`);
}

export async function importEvaluationDatasetItems(
  datasetId: string,
  file: File
): Promise<{ imported: number }> {
  const headers = await getAuthHeaders();
  const formData = new FormData();
  formData.append('file', file);
  const res = await authAwareFetch(
    `${config.apiUrl}/api/evaluation-datasets/${datasetId}/items/import`,
    {
      method: 'POST',
      headers: { ...headers },
      body: formData,
      credentials: 'include',
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to import CSV');
  }
  return res.json();
}

export async function runEvaluation(
  datasetId: string,
  body?: { evaluation_type?: string }
): Promise<EvaluationRunResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/evaluation-datasets/${datasetId}/run`, {
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
  datasetId: string,
  params?: { offset?: number; limit?: number }
): Promise<EvaluationRunListResponse> {
  const headers = await getAuthHeaders();
  const q = new URLSearchParams();
  if (params?.offset != null) q.set('offset', String(params.offset));
  if (params?.limit != null) q.set('limit', String(params.limit));
  const qs = q.toString() ? `?${q.toString()}` : '';
  const res = await authAwareFetch(`${config.apiUrl}/api/evaluation-datasets/${datasetId}/runs${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to list evaluation runs: ${res.status}`);
  return res.json();
}

export async function getEvaluationRun(
  datasetId: string,
  runId: string
): Promise<EvaluationRunResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/evaluation-datasets/${datasetId}/runs/${encodeURIComponent(runId)}`,
    { headers: { ...headers }, credentials: 'include' }
  );
  if (!res.ok) throw new Error(`Failed to load evaluation run: ${res.status}`);
  return res.json();
}

export async function deleteEvaluationRun(datasetId: string, runId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/evaluation-datasets/${datasetId}/runs/${encodeURIComponent(runId)}`,
    { method: 'DELETE', headers: { ...headers }, credentials: 'include' }
  );
  if (!res.ok) throw new Error(`Failed to delete evaluation run: ${res.status}`);
}

export async function compareEvaluationRuns(
  datasetId: string,
  runA: string,
  runB: string
): Promise<EvaluationCompareResponse> {
  const headers = await getAuthHeaders();
  const q = new URLSearchParams({ run_a: runA, run_b: runB });
  const res = await authAwareFetch(
    `${config.apiUrl}/api/evaluation-datasets/${datasetId}/runs/compare?${q.toString()}`,
    { headers: { ...headers }, credentials: 'include' }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to compare runs');
  }
  return res.json();
}
