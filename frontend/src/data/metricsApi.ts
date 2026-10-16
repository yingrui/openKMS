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
  /** The model that defines it — the API has always sent this; the type was missing it. */
  semantic_model_id: string;
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

export function metricExpressionSql(m: MetricResponse): string {
  const d = m.expression?.dialects;
  if (Array.isArray(d)) return d.find((x) => x.dialect === 'ANSI_SQL')?.expression ?? '';
  return '';
}

/** Build an Ossie expression (list form) from a SQL fragment. */
export function makeMetricExpression(sql: string): MetricExpression {
  return { dialects: [{ dialect: 'ANSI_SQL', expression: sql }] };
}
