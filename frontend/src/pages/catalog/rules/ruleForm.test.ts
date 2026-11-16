import { describe, expect, it } from 'vitest';
import { buildRulePayload, EMPTY_FORM, formFromRule } from './ruleForm';
import type { RuleOut } from '../../../data/rulesApi';

function rule(overrides: Partial<RuleOut> = {}): RuleOut {
  return {
    id: 'r1',
    rule_id: 'allocation-snapshot',
    name: '分货方案与明细勾稽',
    metric_id: 'm1',
    condition: null,
    identities: [
      {
        target: { metric: 'm1' },
        members: [{ metric: 'm2', weight: 1 }],
        tolerance: { abs: 0 },
      },
      {
        target: { metric: 'm3' },
        members: [{ metric: 'm4', weight: 1 }],
        tolerance: { rel: 0.001 },
      },
    ],
    severity: 'P1',
    conclusion: '',
    suggestion: 'x',
    owner: null,
    status: 'active',
    version: 1,
    last_run_at: null,
    last_status: null,
    last_period_start: null,
    last_period_end: null,
    last_reason: null,
    metric_ids: ['m1', 'm2', 'm3', 'm4'],
    run_params: {
      arguments: [
        {
          key: 'cycle',
          kind: 'filter',
          field: 'cycle',
          role: 'period',
          required: true,
          calendar: 'week',
          format: 'YYYY-Www',
          has_interval: true,
          dataset_id: 'scen',
        },
      ],
    },
    group_by: { field: 'scenario_id' },
    ...overrides,
  };
}

describe('rule form ↔ payload', () => {
  it('keeps every identity through an edit round trip', () => {
    const form = formFromRule(rule(), [], []);
    expect(form.mode).toBe('relation');
    expect(form.relations).toHaveLength(2);
    expect(form.relations[1].toleranceKind).toBe('rel');

    const payload = buildRulePayload(form, null);
    expect(payload.identities).toHaveLength(2);
    expect(payload.identities?.[0]).toEqual({
      target: { metric: 'm1' },
      members: [{ metric: 'm2', weight: 1 }],
      tolerance: { abs: 0 },
    });
    expect(payload.condition).toBeUndefined();
    expect(payload.run_params?.arguments[0].role).toBe('period');
  });

  it('sends a condition, and no identities, for a threshold rule', () => {
    const form = { ...EMPTY_FORM, mode: 'condition' as const, metricId: 'm1' };
    const condition = { left: { metric: 'm1' }, op: '>', right: { value: 0 } } as const;
    const payload = buildRulePayload(form, condition);
    expect(payload.condition).toBe(condition);
    expect(payload.identities).toBeUndefined();
  });
});
