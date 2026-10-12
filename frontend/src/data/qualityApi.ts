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
): Promise<QualityRunResponse[]> {
  return request<QualityRunResponse[]>(`/api/datasets/${datasetId}/quality-rules/${ruleId}/runs`);
}
