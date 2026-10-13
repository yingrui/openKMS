/** API for dataset relationships (Ossie foreign keys: `from` many → `to` one). */
import { request } from './apiClient';

export type DatasetJoinType = 'left' | 'inner' | 'right' | 'full';

export interface DatasetJoinResponse {
  id: string;
  name: string | null;
  from_dataset_id: string;
  from_dataset_name: string | null;
  to_dataset_id: string;
  to_dataset_name: string | null;
  from_columns: string[];
  to_columns: string[];
  join_type: string;
  ai_context: Record<string, unknown> | null;
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
  from_dataset_id: string;
  to_dataset_id: string;
  from_columns: string[];
  to_columns: string[];
  join_type: DatasetJoinType;
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
    from_columns?: string[];
    to_columns?: string[];
    join_type?: DatasetJoinType;
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
