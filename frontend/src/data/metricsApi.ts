/** API for model-level metric definitions (Ossie SQL expressions). */
import { request } from './apiClient';

export interface MetricFilter {
  column: string;
  op: string;
  value?: unknown;
}

export interface MetricDialect {
  dialect: string;
  expression: string;
}

export interface MetricExpression {
  dialects?: MetricDialect[];
}

export interface MetricResponse {
  id: string;
  base_dataset_id: string;
  base_dataset_name: string | null;
  name: string;
  business_definition: string | null;
  type: string;
  expression: MetricExpression | null;
  datatype: string | null;
  filters: MetricFilter[] | null;
  joins: string[] | null;
  ai_context: Record<string, unknown> | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetricListResponse {
  items: MetricResponse[];
  total: number;
}

export interface MetricRunResponse {
  id: string;
  metric_id: string;
  status: string;
  row_count: number;
  duration_ms: number;
  error: string | null;
  ran_by_name: string | null;
  created_at: string;
}

export interface MetricPayload {
  name: string;
  semantic_model_id: string;
  base_dataset_id: string;
  business_definition?: string | null;
  type: string;
  expression: MetricExpression;
  datatype?: string | null;
  filters?: MetricFilter[] | null;
  joins?: string[] | null;
  ai_context?: Record<string, unknown> | null;
}

export async function fetchMetrics(semanticModelId?: string): Promise<MetricListResponse> {
  return request<MetricListResponse>('/api/metrics', {
    query: semanticModelId ? { semantic_model_id: semanticModelId } : undefined,
  });
}

export async function createMetric(data: MetricPayload): Promise<MetricResponse> {
  return request<MetricResponse>('/api/metrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateMetric(
  id: string,
  data: Partial<MetricPayload>,
): Promise<MetricResponse> {
  return request<MetricResponse>(`/api/metrics/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteMetric(id: string): Promise<void> {
  return request<void>(`/api/metrics/${id}`, { method: 'DELETE' });
}

export async function fetchMetricRuns(id: string): Promise<MetricRunResponse[]> {
  return request<MetricRunResponse[]>(`/api/metrics/${id}/runs`);
}

/** The ANSI_SQL fragment of a metric expression, for display. */
export function metricExpressionSql(m: MetricResponse): string {
  const d = m.expression?.dialects;
  if (Array.isArray(d)) return d.find((x) => x.dialect === 'ANSI_SQL')?.expression ?? '';
  return '';
}

/** Build an Ossie expression (list form) from a SQL fragment. */
export function makeMetricExpression(sql: string): MetricExpression {
  return { dialects: [{ dialect: 'ANSI_SQL', expression: sql }] };
}
