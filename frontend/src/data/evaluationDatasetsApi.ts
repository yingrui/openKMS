/** API for evaluation datasets (KB QA performance evaluation). */
import { config } from '../config';
import { getAuthHeaders } from './apiClient';

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

export interface EvaluationRunResult {
  item_id: string;
  query: string;
  expected_answer: string;
  generated_answer: string;
  sources: Array<Record<string, unknown>>;
}

export interface EvaluationRunResponse {
  results: EvaluationRunResult[];
}

export async function fetchEvaluationDatasets(params?: {
  knowledge_base_id?: string;
}): Promise<EvaluationDatasetListResponse> {
  const headers = await getAuthHeaders();
  const query = new URLSearchParams();
  if (params?.knowledge_base_id) query.set('knowledge_base_id', params.knowledge_base_id);
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await fetch(`${config.apiUrl}/api/evaluation-datasets${qs}`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch evaluation datasets: ${res.status}`);
  return res.json();
}

export async function fetchEvaluationDataset(id: string): Promise<EvaluationDatasetResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/evaluation-datasets/${id}`, {
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
  const res = await fetch(`${config.apiUrl}/api/evaluation-datasets`, {
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
  const res = await fetch(`${config.apiUrl}/api/evaluation-datasets/${id}`, {
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
  const res = await fetch(`${config.apiUrl}/api/evaluation-datasets/${id}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to delete evaluation dataset: ${res.status}`);
}

export async function fetchEvaluationDatasetItems(
  datasetId: string
): Promise<EvaluationDatasetItemResponse[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/evaluation-datasets/${datasetId}/items`, {
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
  const res = await fetch(`${config.apiUrl}/api/evaluation-datasets/${datasetId}/items`, {
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
  const res = await fetch(
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
  const res = await fetch(
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
  const res = await fetch(
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

export async function runEvaluation(datasetId: string): Promise<EvaluationRunResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/evaluation-datasets/${datasetId}/run`, {
    method: 'POST',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to run evaluation');
  }
  return res.json();
}
