/** API for dataset file ingest (upload → preview → load). */
import { request } from './apiClient';
import type { DatasetResponse } from './datasetsApi';

export interface DatasetIngestResponse {
  id: string;
  data_source_id: string;
  dataset_id: string | null;
  filename: string;
  status: string;
  schema_name: string | null;
  table_name: string | null;
  row_count: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface DatasetIngestPreviewColumn {
  name: string;
  pg_type: string;
  sample_values: string[];
}

export interface DatasetIngestPreview {
  ingest_id: string;
  columns: DatasetIngestPreviewColumn[];
  sample_rows: Record<string, unknown>[];
  warnings: string[];
}

export async function startDatasetIngest(
  file: File,
  dataSourceId: string,
): Promise<DatasetIngestResponse> {
  const fd = new FormData();
  fd.append('file', file, file.name);
  fd.append('data_source_id', dataSourceId);
  return request<DatasetIngestResponse>('/api/datasets/ingests', { method: 'POST', body: fd });
}

export async function previewDatasetIngest(ingestId: string): Promise<DatasetIngestPreview> {
  return request<DatasetIngestPreview>(`/api/datasets/ingests/${ingestId}/preview`, {
    method: 'POST',
  });
}

export async function loadDatasetIngest(
  ingestId: string,
  data: { schema_name: string; table_name: string; mode: string },
): Promise<DatasetResponse> {
  return request<DatasetResponse>(`/api/datasets/ingests/${ingestId}/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
