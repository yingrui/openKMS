/**
 * Rules app API.
 *
 * Rules and events are ontology objects (`Rule` / `Event`), so there is no generic CRUD here beyond
 * what the rules page needs: list with the last run denormalised, create/patch, and run.
 * Reading the events themselves needs no API — they are objects, visible in Object Explorer.
 */

import { request } from './apiClient';

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
  id: string;
  rule_id: string | null;
  name: string | null;
  metric_id: string | null;
  condition: RuleCondition | null;
  relation: RuleRelation | null;
  severity: string | null;
  conclusion: string | null;
  suggestion: string | null;
  owner: string | null;
  status: string | null;
  version: number | null;
  last_run_at: string | null;
  last_status: string | null;
  last_period_start: string | null;
  last_period_end: string | null;
  last_reason: string | null;
  /** Metric ids this rule references — a list can answer "covered" without N calls. */
  metric_ids: string[];
  group_by: RuleGroupBy | null;
};

/** An identity between metrics: `target = Σ weight × member`, within a tolerance. */
export type RuleRelation = {
  target: { metric: string; group_field?: string | null };
  members: Array<{ metric: string; weight?: number; group_field?: string | null }>;
  tolerance?: { abs?: number; rel?: number } | null;
  note?: string | null;
};

export type RuleWritePayload = {
  name: string;
  rule_id?: string | null;
  metric_id: string;
  condition?: RuleCondition | null;
  severity: string;
  conclusion: string;
  suggestion: string;
  owner?: string | null;
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
  /** Dry runs only: this hit carries advice and a publishable severity, so it *would* open one. */
  would_publish: boolean;
};

export type RulesEvaluateResponse = {
  results: RuleEvalResult[];
  failed: number;
  unknown: number;
};

export async function fetchRules(params?: { metric_id?: string }): Promise<RuleOut[]> {
  return request<RuleOut[]>('/api/metric-rules', { query: params });
}

export async function createRule(payload: RuleWritePayload): Promise<RuleOut> {
  return request<RuleOut>('/api/metric-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function fetchRule(ruleId: string): Promise<RuleOut> {
  return request<RuleOut>(`/api/metric-rules/${ruleId}`);
}

export async function deleteRule(ruleId: string): Promise<void> {
  return request<void>(`/api/metric-rules/${ruleId}`, { method: 'DELETE' });
}

export async function fetchRuleEvents(
  ruleId: string,
  params: { status?: string; limit?: number } = {},
): Promise<import('./eventsApi').EventListResponse> {
  return request<import('./eventsApi').EventListResponse>(`/api/metric-rules/${ruleId}/events`, {
    query: { status: params.status, limit: params.limit },
  });
}

export async function updateRule(
  ruleId: string,
  payload: Partial<RuleWritePayload>,
): Promise<RuleOut> {
  return request<RuleOut>(`/api/metric-rules/${ruleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function evaluateRule(
  ruleId: string,
  params: { period_start?: string; period_end?: string; dry_run?: boolean } = {},
): Promise<RulesEvaluateResponse> {
  return request<RulesEvaluateResponse>(`/api/metric-rules/${ruleId}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export async function evaluateRules(params: {
  metric_id?: string;
  period_start?: string;
  period_end?: string;
  scope?: string;
}): Promise<RulesEvaluateResponse> {
  return request<RulesEvaluateResponse>('/api/metric-rules/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}

/** A rule that references one metric, with its last run — what the metric page shows beside the number. */
export type MetricRuleRef = {
  id: string;
  rule_id: string | null;
  name: string | null;
  last_status: 'pass' | 'fail' | 'unknown' | null;
  last_period_start: string | null;
  last_period_end: string | null;
  last_run_at: string | null;
  last_reason: string | null;
};

export async function fetchMetricRules(metricId: string): Promise<MetricRuleRef[]> {
  return request<MetricRuleRef[]>(`/api/metrics/${metricId}/rules`);
}
