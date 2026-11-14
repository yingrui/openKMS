/**
 * Rules app API.
 *
 * Rules and events are ontology objects (`Rule` / `Event`), so there is no generic CRUD here beyond
 * what the rules page needs: list with the last run denormalised, create/patch, and run.
 * Reading the events themselves needs no API — they are objects, visible in Object Explorer.
 */

import { request } from './apiClient';

export type RuleSubject = { kind: 'metric' | 'dataset'; ref: string };

export type RuleOperand =
  | { metric: string; filters?: Array<Record<string, unknown>> }
  | {
      dataset_agg: {
        dataset_id: string;
        fn: 'count' | 'sum' | 'avg' | 'min' | 'max';
        column?: string | null;
        filters?: Array<Record<string, unknown>>;
      };
    }
  | { diff: [RuleOperand, RuleOperand] }
  | { ratio: [RuleOperand, RuleOperand] };

export type RuleCondition =
  | { left: RuleOperand; op: string; right: { value: number } }
  | { all: RuleCondition[] }
  | { any: RuleCondition[] };

export type RuleGroupBy = { field: string; label?: string | null };

export type RuleOut = {
  object_id: string;
  rule_id: string | null;
  name: string | null;
  domain: string | null;
  subject: RuleSubject | null;
  condition: RuleCondition | null;
  severity: string | null;
  conclusion: string | null;
  suggestion: string | null;
  owner: string | null;
  status: string | null;
  version: number | null;
  last_run_at: string | null;
  last_status: string | null;
  last_values: Record<string, number | null> | null;
  ai_context: string | null;
  about_object_type: string | null;
  group_by: RuleGroupBy | null;
  last_groups: number | null;
  last_failed_groups: string[] | null;
};

export type RuleWritePayload = {
  name: string;
  rule_id?: string | null;
  subject: RuleSubject;
  condition: RuleCondition;
  severity: string;
  conclusion: string;
  suggestion: string;
  domain?: string;
  owner?: string | null;
  ai_context?: string | null;
  about_object_type?: string | null;
  group_by?: RuleGroupBy | null;
  status?: string;
};

export type RuleEvalResult = {
  rule_id: string;
  status: 'pass' | 'fail' | 'unknown' | 'skipped';
  values: Record<string, number | null>;
  event_id: string | null;
  reason: string | null;
  group: { field: string; value: string | null } | null;
};

export type RulesEvaluateResponse = {
  results: RuleEvalResult[];
  failed: number;
  unknown: number;
};

export async function fetchRules(params?: {
  subject_type?: 'metric' | 'dataset';
  subject_id?: string;
}): Promise<RuleOut[]> {
  return request<RuleOut[]>('/api/rules', { query: params });
}

export async function createRule(payload: RuleWritePayload): Promise<RuleOut> {
  return request<RuleOut>('/api/rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function fetchRule(ruleId: string): Promise<RuleOut> {
  return request<RuleOut>(`/api/rules/${ruleId}`);
}

export async function deleteRule(ruleId: string): Promise<void> {
  return request<void>(`/api/rules/${ruleId}`, { method: 'DELETE' });
}

export async function fetchRuleEvents(
  ruleId: string,
  params: { status?: string; limit?: number } = {},
): Promise<import('./eventsApi').EventListResponse> {
  return request<import('./eventsApi').EventListResponse>(`/api/rules/${ruleId}/events`, {
    query: { status: params.status, limit: params.limit },
  });
}

export async function updateRule(
  ruleId: string,
  payload: Partial<RuleWritePayload>,
): Promise<RuleOut> {
  return request<RuleOut>(`/api/rules/${ruleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function evaluateRule(
  ruleId: string,
  params: { period_start?: string; period_end?: string } = {},
): Promise<RulesEvaluateResponse> {
  return request<RulesEvaluateResponse>(`/api/rules/${ruleId}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export async function evaluateRules(params: {
  subject_type?: 'metric' | 'dataset';
  subject_id?: string;
  period_start?: string;
  period_end?: string;
  scope?: string;
}): Promise<RulesEvaluateResponse> {
  return request<RulesEvaluateResponse>('/api/rules/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}
