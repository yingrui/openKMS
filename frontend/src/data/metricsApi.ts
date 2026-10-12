/** API for dataset metric definitions. */
import { request } from './apiClient';

export interface MetricFilter {
  column: string;
  op: string;
  value?: unknown;
}

export interface MetricResponse {
  id: string;
  dataset_id: string;
  name: string;
  business_definition: string | null;
  aggregation: string;
  column_name: string | null;
  filters: MetricFilter[] | null;
  joins: string[] | null;
  dimensions: string[] | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetricComputeResponse {
  metric_id: string;
  rows: Record<string, unknown>[];
}

export async function fetchMetrics(datasetId: string): Promise<MetricResponse[]> {
  return request<MetricResponse[]>(`/api/datasets/${datasetId}/metrics`);
}

export async function createMetric(
  datasetId: string,
  data: {
    name: string;
    business_definition?: string | null;
    aggregation: string;
    column_name?: string | null;
    filters?: MetricFilter[] | null;
    joins?: string[] | null;
    dimensions?: string[] | null;
  },
): Promise<MetricResponse> {
  return request<MetricResponse>(`/api/datasets/${datasetId}/metrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteMetric(datasetId: string, metricId: string): Promise<void> {
  return request<void>(`/api/datasets/${datasetId}/metrics/${metricId}`, { method: 'DELETE' });
}

export async function computeMetric(
  datasetId: string,
  metricId: string,
): Promise<MetricComputeResponse> {
  return request<MetricComputeResponse>(`/api/datasets/${datasetId}/metrics/${metricId}/compute`, {
    method: 'POST',
  });
}
