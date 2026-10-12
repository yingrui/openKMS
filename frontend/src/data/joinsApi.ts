/** API for dataset joins (the data-engineering ER model). */
import { request } from './apiClient';

export interface DatasetJoinColumn {
  source: string;
  target: string;
}

export interface DatasetJoinResponse {
  id: string;
  name: string | null;
  source_dataset_id: string;
  source_dataset_name: string | null;
  target_dataset_id: string;
  target_dataset_name: string | null;
  cardinality: string;
  join_columns: DatasetJoinColumn[];
  description: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface DatasetJoinListResponse {
  items: DatasetJoinResponse[];
  total: number;
}

export async function fetchDatasetJoins(datasetId?: string): Promise<DatasetJoinListResponse> {
  return request<DatasetJoinListResponse>('/api/dataset-joins', {
    query: datasetId ? { dataset_id: datasetId } : undefined,
  });
}

export async function createDatasetJoin(data: {
  name?: string | null;
  source_dataset_id: string;
  target_dataset_id: string;
  cardinality: string;
  join_columns: DatasetJoinColumn[];
  description?: string | null;
}): Promise<DatasetJoinResponse> {
  return request<DatasetJoinResponse>('/api/dataset-joins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateDatasetJoin(
  id: string,
  data: {
    name?: string | null;
    cardinality?: string;
    join_columns?: DatasetJoinColumn[];
    description?: string | null;
  }
): Promise<DatasetJoinResponse> {
  return request<DatasetJoinResponse>(`/api/dataset-joins/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteDatasetJoin(id: string): Promise<void> {
  return request<void>(`/api/dataset-joins/${id}`, { method: 'DELETE' });
}
