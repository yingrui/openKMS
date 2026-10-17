/** API for dataset quality rules. */
import { request } from './apiClient';

export interface QualityRuleResponse {
  id: string;
  dataset_id: string;
  name: string;
  rule_type: string;
  column_name: string | null;
  config: Record<string, unknown> | null;
  severity: string;
  enabled: boolean;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  last_status: string | null;
  last_run_at: string | null;
}

export interface QualityRunResponse {
  id: string;
  rule_id: string;
  status: string;
  checked_count: number | null;
  failed_count: number | null;
  detail: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

export async function fetchQualityRules(datasetId: string): Promise<QualityRuleResponse[]> {
  return request<QualityRuleResponse[]>(`/api/datasets/${datasetId}/quality-rules`);
}

export async function createQualityRule(
  datasetId: string,
  data: {
    name: string;
    rule_type: string;
    column_name?: string | null;
    config?: Record<string, unknown> | null;
    severity?: string;
  },
): Promise<QualityRuleResponse> {
  return request<QualityRuleResponse>(`/api/datasets/${datasetId}/quality-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

/** A rule's editable surface. `rule_type` is deliberately absent: changing it would orphan its config. */
export interface QualityRuleUpdate {
  name?: string;
  column_name?: string | null;
  config?: Record<string, unknown>;
  severity?: string;
  enabled?: boolean;
}

export async function updateQualityRule(
  datasetId: string,
  ruleId: string,
  body: QualityRuleUpdate,
): Promise<QualityRuleResponse> {
  return request<QualityRuleResponse>(`/api/datasets/${datasetId}/quality-rules/${ruleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export interface QualityRuleValidateResult {
  ok: boolean;
  failed_count: number | null;
  /** The number the query returned, so it can be said in the rule's own direction. */
  value: number | null;
  expect: 'zero' | 'nonzero' | null;
  error: string | null;
}

/** Run a `sql` rule without saving it — the same code path as running it. */
export async function validateQualityRule(
  datasetId: string,
  body: { sql: string; column_name?: string | null; expect?: 'zero' | 'nonzero' },
): Promise<QualityRuleValidateResult> {
  return request<QualityRuleValidateResult>(`/api/datasets/${datasetId}/quality-rules/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchQualityRule(
  datasetId: string,
  ruleId: string,
): Promise<QualityRuleResponse> {
  return request<QualityRuleResponse>(`/api/datasets/${datasetId}/quality-rules/${ruleId}`);
}

export async function deleteQualityRule(datasetId: string, ruleId: string): Promise<void> {
  return request<void>(`/api/datasets/${datasetId}/quality-rules/${ruleId}`, { method: 'DELETE' });
}

export async function runQualityRule(datasetId: string, ruleId: string): Promise<QualityRuleResponse> {
  return request<QualityRuleResponse>(`/api/datasets/${datasetId}/quality-rules/${ruleId}/run`, {
    method: 'POST',
  });
}

export async function fetchQualityRuns(
  datasetId: string,
  ruleId: string,
  /** Cursor paging: the last run you already have, newest first. */
  page?: { limit: number; before?: string; beforeId?: string },
): Promise<QualityRunResponse[]> {
  const query: Record<string, string | number> = page ? { limit: page.limit } : {};
  if (page?.before && page.beforeId) {
    query.before = page.before;
    query.before_id = page.beforeId;
  }
  return request<QualityRunResponse[]>(`/api/datasets/${datasetId}/quality-rules/${ruleId}/runs`, {
    query,
  });
}

/** One rule with the latest run that judged it — the quality inbox's row. */
export interface QualityIssue {
  id: string;
  dataset_id: string;
  dataset_name: string;
  name: string;
  rule_type: string;
  column_name: string | null;
  severity: string;
  /** `passed` | `failed` | `error` | `never` (no run at all is a state of its own). */
  status: string;
  checked_count: number | null;
  failed_count: number | null;
  detail: Record<string, unknown> | null;
  error_message: string | null;
  last_run_at: string | null;
}

export interface QualityIssueListResponse {
  items: QualityIssue[];
  total: number;
}

export async function fetchQualityIssues(): Promise<QualityIssueListResponse> {
  return request<QualityIssueListResponse>('/api/quality-issues');
}
