/**
 * The resource hint has to name the condition and say that more are still allowed.
 *
 * "This resource limits rows with 1 condition(s)" reads as a restriction *on the caller* — as if
 * the resource had capped what they may ask. It has not: the condition is a floor the server
 * enforces, and every filter and grouping the caller adds still applies on top. The sentence has
 * to show the actual condition, otherwise the number alone says nothing about what is being
 * filtered.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const fetchMetrics = vi.fn();
const fetchModelFields = vi.fn();
const fetchDatasetJoins = vi.fn();
const fetchDataResources = vi.fn();

vi.mock('../../data/semanticModelsApi', async () => {
  const actual = await vi.importActual<typeof import('../../data/semanticModelsApi')>(
    '../../data/semanticModelsApi',
  );
  return { ...actual, querySemanticModel: vi.fn() };
});
vi.mock('../../data/metricsApi', async () => {
  const actual = await vi.importActual<typeof import('../../data/metricsApi')>(
    '../../data/metricsApi',
  );
  return { ...actual, fetchMetrics: (...a: unknown[]) => fetchMetrics(...a) };
});
vi.mock('../../data/semanticModelFieldsApi', async () => {
  const actual = await vi.importActual<typeof import('../../data/semanticModelFieldsApi')>(
    '../../data/semanticModelFieldsApi',
  );
  return { ...actual, fetchModelFields: (...a: unknown[]) => fetchModelFields(...a) };
});
vi.mock('../../data/joinsApi', () => ({
  fetchDatasetJoins: (...a: unknown[]) => fetchDatasetJoins(...a),
}));
vi.mock('../../data/dataResourcesApi', () => ({
  fetchDataResources: (...a: unknown[]) => fetchDataResources(...a),
}));
vi.mock('./useSemanticModelDetail', () => ({
  useSemanticModelDetail: () => ({
    model: {
      id: 'm1',
      name: 'Stock',
      access_mode: 'restricted',
      dataset_ids: ['ds_fact'],
      datasets: [{ id: 'ds_fact', name: 'daily_basic' }],
    },
    allDatasets: [{ id: 'ds_fact', kind: 'table', display_name: 'daily_basic' }],
  }),
}));

import { ModelPlaygroundSection } from './ModelPlaygroundSection';

describe('the selected resource hint', () => {
  it('spells out the enforced condition and says the caller can still narrow further', async () => {
    fetchMetrics.mockResolvedValue({ items: [], total: 0 });
    fetchModelFields.mockResolvedValue({ items: [], total: 0 });
    fetchDatasetJoins.mockResolvedValue({ items: [], total: 0 });
    fetchDataResources.mockResolvedValue({
      items: [
        {
          id: 'r1',
          name: 'Stock of semi-conductor',
          description: null,
          semantic_model_id: 'm1',
          row_policy: [{ column: 'industry', op: '=', value: '半导体' }],
          created_by_name: null,
          created_at: '2026-11-01T00:00:00Z',
          updated_at: '2026-11-01T00:00:00Z',
        },
      ],
      total: 1,
    });

    render(
      <MemoryRouter initialEntries={['/x']}>
        <ModelPlaygroundSection />
      </MemoryRouter>,
    );

    // The condition is shown directly, as the chip's own text.
    const chip = await screen.findByText('industry = 半导体', undefined, { timeout: 3000 });
    expect(chip.tagName).toBe('CODE');
    // The explanation (that the caller's filters still apply) moved into the chip's tooltip, so
    // the row stays one line. It must still be reachable, not deleted.
    const tooltip = chip.getAttribute('title') ?? '';
    expect(tooltip).toContain('industry = 半导体');
    expect(tooltip.toLowerCase()).toMatch(/filters|grouping/);
    // The old wording implied the resource capped the caller's query.
    expect(chip.textContent ?? '').not.toMatch(/limits rows with/i);
  });

  it('puts the resource in its own panel, not among the query fields', async () => {
    fetchMetrics.mockResolvedValue({ items: [], total: 0 });
    fetchModelFields.mockResolvedValue({ items: [], total: 0 });
    fetchDatasetJoins.mockResolvedValue({ items: [], total: 0 });
    fetchDataResources.mockResolvedValue({
      items: [
        {
          id: 'r1',
          name: 'Stock of semi-conductor',
          description: null,
          semantic_model_id: 'm1',
          row_policy: [{ column: 'industry', op: '=', value: '半导体' }],
          created_by_name: null,
          created_at: '2026-11-01T00:00:00Z',
          updated_at: '2026-11-01T00:00:00Z',
        },
      ],
      total: 1,
    });

    render(
      <MemoryRouter initialEntries={['/x']}>
        <ModelPlaygroundSection />
      </MemoryRouter>,
    );

    const select = await screen.findByLabelText(/data resource/i, undefined, { timeout: 3000 });
    // Its own card: a `section.account-card`, headed by a visible title.
    const panel = select.closest('section.account-card');
    expect(panel).not.toBeNull();
    // And it is not inside the query editor panel (`FormField` wraps the metric, grouping, ...).
    expect(select.closest('.entity-view__form')).toBeNull();
  });
});
