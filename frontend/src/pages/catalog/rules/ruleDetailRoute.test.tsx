/**
 * The page itself, not just its parts: opening `…/settings` on a stored rule must show the rule's own check.
 *
 * A leftover effect from the create flow used to reset the draft to an empty threshold row on every load, so
 * the settings page showed "阈值条件 / <some metric> > 0" while the overview showed the four identities.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ConfirmProvider } from '../../../contexts/ConfirmContext';
import { describe, expect, it, vi } from 'vitest';
import type { RuleOut } from '../../../data/rulesApi';

const identity = (target: string, member: string) => ({
  target: { metric: target },
  members: [{ metric: member, weight: 1, group_field: 'scenario_key' }],
  tolerance: { abs: 0 },
});

const rule = {
  id: 'r1',
  rule_id: 'allocation-snapshot-reconcile',
  name: '分货方案与明细勾稽',
  description: '',
  metric_id: 'm1',
  condition: null,
  identities: [identity('m1', 'e1'), identity('m2', 'e2'), identity('m3', 'e3'), identity('m4', 'e4')],
  severity: 'P1',
  conclusion: '',
  suggestion: '',
  owner: null,
  status: 'active',
  version: 3,
  last_run_at: null,
  last_status: null,
  last_period_start: null,
  last_period_end: null,
  last_reason: null,
  metric_ids: ['m1'],
  run_params: null,
  group_by: { field: 'scenario_id' },
} as unknown as RuleOut;

vi.mock('../../../data/rulesApi', () => ({
  fetchRule: async () => rule,
  fetchRuleEvents: async () => ({ items: [], total: 0 }),
  fetchRules: async () => [rule],
  createRule: async () => rule,
  updateRule: async () => rule,
  deleteRule: async () => {},
  evaluateRule: async () => ({ results: [], failed: 0, unknown: 0 }),
  evaluateRules: async () => ({ results: [], failed: 0, unknown: 0 }),
}));
vi.mock('../../../data/metricsApi', () => ({
  fetchMetrics: async () => ({
    items: ['m1', 'm2', 'm3', 'm4', 'e1', 'e2', 'e3', 'e4'].map((id) => ({
      id,
      name: `M-${id}`,
      semantic_model_id: 'model',
    })),
    total: 8,
  }),
}));
vi.mock('../../../data/datasetsApi', () => ({
  fetchDatasets: async () => ({ items: [], total: 0 }),
}));
vi.mock('../../../data/semanticModelFieldsApi', () => ({
  fetchModelFields: async () => ({ items: [] }),
  isTimeDimension: () => false,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { RuleDetailPage } from './RuleDetailPage';
import { RuleOverviewTab } from './RuleOverviewTab';
import { RuleSettingsTab } from './RuleSettingsTab';
import { RuleEventsTab } from './RuleEventsTab';

function renderAt(path: string) {
  return render(
    <ConfirmProvider>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="data-rules/:ruleId" element={<RuleDetailPage />}>
          <Route index element={<RuleOverviewTab />} />
          <Route path="events" element={<RuleEventsTab />} />
          <Route path="settings" element={<RuleSettingsTab />} />
        </Route>
      </Routes>
    </MemoryRouter>
    </ConfirmProvider>,
  );
}

describe('a stored rule page', () => {
  it('shows the stored check in settings, not a blank threshold', async () => {
    renderAt('/data-rules/r1/settings');
    const previews = await screen.findAllByText(/M-m\d = M-e\d/);
    expect(previews).toHaveLength(4);
    expect(screen.queryByText('rules.modeCondition')).toBeTruthy();
  });
});
