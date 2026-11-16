/**
 * A rule with four identities must *show* four identities: they are one check, not one rule per number, so a
 * view that renders the first one and calls it the check is wrong. The same view must keep each member's own
 * grouping key — the two sides of an identity often name the same key differently.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RuleDetailCtx } from './ruleDetailContext';
import type { RuleOut } from '../../../data/rulesApi';

const identity = (target: string, member: string) => ({
  target: { metric: target },
  members: [{ metric: member, weight: 1, group_field: 'scenario_key' }],
  tolerance: { abs: 1 },
});

const rule = {
  id: 'r1',
  rule_id: 'allocation-snapshot-reconcile',
  name: '分货方案与明细勾稽',
  description: '',
  metric_id: 'm1',
  condition: null,
  identities: [identity('m1', 'm2'), identity('m3', 'm4'), identity('m5', 'm6'), identity('m7', 'm8')],
  severity: 'P1',
  conclusion: '',
  suggestion: '',
  owner: null,
  status: 'active',
  version: 1,
  last_run_at: null,
  last_status: null,
  last_period_start: null,
  last_period_end: null,
  last_reason: null,
  metric_ids: ['m1'],
  run_params: null,
  group_by: null,
} as unknown as RuleOut;

const ctx = {
  rule,
  form: formFromRule(rule, [], []),
  metricName: (id: string) => `metric-${id}`,
  datasetName: (id: string) => `dataset-${id}`,
  joinerWords: { and: '且', or: '或', scopePrefix: '范围' },
  conditionRows: [],
  metrics: [],
  datasets: [],
  paramCandidates: [],
  periodSpec: null,
  dirtyAll: () => false,
  saveAll: () => {},
  remove: async () => {},
} as unknown as RuleDetailCtx;

vi.mock('react-router-dom', () => ({
  useOutletContext: () => ctx,
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  NavLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { RuleOverviewTab } from './RuleOverviewTab';

describe('the overview of a rule', () => {
  it('states every identity, not just the first', () => {
    render(<RuleOverviewTab />);
    expect(screen.getAllByText(/metric-m\d =/)).toHaveLength(4);
  });

  it('says which key a member is aligned on', () => {
    render(<RuleOverviewTab />);
    expect(screen.getAllByText(/按 scenario_key/)).toHaveLength(4);
  });
});

import { RuleSettingsTab } from './RuleSettingsTab';
import { formFromRule } from './ruleForm';

describe('the settings page of a rule', () => {
  it('renders the definition form', () => {
    render(<RuleSettingsTab />);
    // Every part of the definition is editable here, in one form.
    expect(screen.getByLabelText('rules.fieldName')).toBeTruthy();
    expect(screen.getByLabelText('rules.fieldDescription')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'shared.save' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'rules.deleteRule' })).toBeTruthy();
  });
});

describe('the check section of the settings page', () => {
  it('shows every identity, with its own numbers', () => {
    render(<RuleSettingsTab />);
    const previews = Array.from(document.querySelectorAll('.rules-condition-current')).map(
      (node) => node.textContent ?? '',
    );
    expect(previews).toHaveLength(4);
    expect(previews[0]).toContain('metric-m1 = metric-m2');
    expect(previews[3]).toContain('metric-m7 = metric-m8');
  });
});
