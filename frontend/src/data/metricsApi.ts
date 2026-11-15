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

/** May the number be summed? `non_additive` (a ratio, a rate) must be recomputed, never added. */
export type MetricAdditivity = 'additive' | 'non_additive';

/** What the expression names: the metrics this one is computed from. */
export interface MetricRef {
  id: string;
  name: string;
}

export interface MetricAiContext {
  instructions?: string;
  synonyms?: string[];
  examples?: string[];
  not_for?: string[];
  [key: string]: unknown;
}

export interface MetricResponse {
  id: string;
  /** The model that defines it — the API has always sent this; the type was missing it. */
  semantic_model_id: string;
  base_dataset_id: string;
  base_dataset_name: string | null;
  name: string;
  business_definition: string | null;
  additivity: MetricAdditivity;
  depends_on: MetricRef[];
  expression: MetricExpression | null;
  datatype: string | null;
  filters: MetricFilter[] | null;
  joins: string[] | null;
  ai_context: MetricAiContext | null;
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
  additivity: MetricAdditivity;
  expression: MetricExpression;
  datatype?: string | null;
  filters?: MetricFilter[] | null;
  joins?: string[] | null;
  ai_context?: MetricAiContext | null;
}

export async function fetchMetrics(semanticModelId?: string): Promise<MetricListResponse> {
  return request<MetricListResponse>('/api/metrics', {
    query: semanticModelId ? { semantic_model_id: semanticModelId } : undefined,
  });
}

/** Structure, not storage: derived edges come from expressions, assertion edges from rules. */
export type MetricGraphNode = {
  id: string;
  name: string;
  additivity: MetricAdditivity;
  base_dataset_id: string;
  expression: string | null;
};

export type MetricGraphEdge = {
  from: string;
  to: string;
  kind: 'derived' | 'assertion';
  weight: number;
  tolerance: { abs?: number; rel?: number } | null;
  source: 'expression' | 'rule';
  rule_id: string | null;
  rule_object_id: string | null;
  health: string | null;
  checked?: boolean;
};

export type MetricGraph = {
  nodes: MetricGraphNode[];
  edges: MetricGraphEdge[];
  derived_count: number;
  assertion_count: number;
};

export async function fetchMetricGraph(semanticModelId: string): Promise<MetricGraph> {
  return request<MetricGraph>(`/api/semantic-models/${semanticModelId}/metric-graph`);
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
